const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Middleware para verificar admin
const requireAdmin = async (req, res, next) => {
    try {
        const result = await query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.user.id]
        );

        if (!result.rows[0]?.is_admin) {
            return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
        }

        next();
    } catch (error) {
        console.error('Error al verificar admin:', error);
        res.status(500).json({ error: 'Error de autenticación' });
    }
};

// ====================================
// GET /api/verification/pending
// Obtener solicitudes pendientes (admin)
// ====================================
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const result = await query(
            `SELECT vr.id, vr.status, vr.bonus_points, vr.created_at,
                    vr.verification_images,
                    p.id as pin_id, p.title as pin_title, p.image_urls as pin_images,
                    p.location_name, p.latitude, p.longitude,
                    u.id as user_id, u.username, u.avatar_url, u.email,
                    u.is_verified_buyer
             FROM verification_requests vr
             JOIN pins p ON vr.pin_id = p.id
             JOIN users u ON vr.user_id = u.id
             WHERE vr.status = 'pending'
             ORDER BY vr.created_at ASC
             LIMIT $1 OFFSET $2`,
            [parseInt(limit), parseInt(offset)]
        );

        const countResult = await query(
            `SELECT COUNT(*) as total FROM verification_requests WHERE status = 'pending'`
        );

        res.json({
            requests: result.rows,
            total: parseInt(countResult.rows[0].total)
        });

    } catch (error) {
        console.error('Error al obtener solicitudes:', error);
        res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
});

// ====================================
// GET /api/verification/all
// Obtener todas las solicitudes (admin)
// ====================================
router.get('/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 50, offset = 0, status } = req.query;

        let queryText = `
            SELECT vr.id, vr.status, vr.bonus_points, vr.created_at,
                   vr.reviewed_at, vr.review_notes, vr.rejection_reason,
                   p.id as pin_id, p.title as pin_title,
                   u.id as user_id, u.username,
                   reviewer.username as reviewer_username
             FROM verification_requests vr
             JOIN pins p ON vr.pin_id = p.id
             JOIN users u ON vr.user_id = u.id
             LEFT JOIN users reviewer ON vr.reviewed_by = reviewer.id
             WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (status) {
            queryText += ` AND vr.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        queryText += ` ORDER BY vr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params);

        res.json({ requests: result.rows });

    } catch (error) {
        console.error('Error al obtener solicitudes:', error);
        res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
});

// ====================================
// POST /api/verification/:id/approve
// Aprobar solicitud de verificación (admin)
// ====================================
router.post('/:id/approve',
    authenticateToken,
    requireAdmin,
    [
        body('notes').optional().trim()
    ],
    async (req, res) => {
        try {
            const { id } = req.params;
            const { notes } = req.body;
            const admin_id = req.user.id;

            // Obtener solicitud
            const request = await query(
                `SELECT vr.*, p.user_id as pin_owner_id, p.title as pin_title
                 FROM verification_requests vr
                 JOIN pins p ON vr.pin_id = p.id
                 WHERE vr.id = $1`,
                [id]
            );

            if (request.rows.length === 0) {
                return res.status(404).json({ error: 'Solicitud no encontrada' });
            }

            const vr = request.rows[0];

            if (vr.status !== 'pending') {
                return res.status(400).json({ error: 'Esta solicitud ya fue procesada' });
            }

            await transaction(async (client) => {
                // Actualizar solicitud
                await client.query(
                    `UPDATE verification_requests
                     SET status = 'approved',
                         reviewed_by = $1,
                         reviewed_at = NOW(),
                         review_notes = $2,
                         points_awarded = true
                     WHERE id = $3`,
                    [admin_id, notes || null, id]
                );

                // Actualizar pin
                await client.query(
                    `UPDATE pins
                     SET verification_status = 'approved',
                         verified_by = $1,
                         verified_at = NOW(),
                         verification_notes = $2
                     WHERE id = $3`,
                    [admin_id, notes || null, vr.pin_id]
                );

                // Dar puntos bonus al usuario
                if (vr.bonus_points > 0) {
                    await client.query(
                        `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
                        [vr.bonus_points, vr.pin_owner_id]
                    );

                    // Registrar transacción
                    await client.query(
                        `INSERT INTO point_transactions
                         (user_id, points, balance_after, related_pin_id, description, used_tresesenta_bonus)
                         VALUES ($1, $2, (SELECT total_points FROM users WHERE id = $1), $3, $4, true)`,
                        [vr.pin_owner_id, vr.bonus_points, vr.pin_id, `Bonus TRESESENTA aprobado: ${vr.pin_title}`]
                    );
                }

                // Registrar en log de moderación
                await client.query(
                    `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason, metadata)
                     VALUES ($1, 'approve_verification', 'verification', $2, $3, $4)`,
                    [admin_id, id, notes || 'Aprobado', JSON.stringify({ bonus_points: vr.bonus_points })]
                );
            });

            res.json({
                message: 'Verificación aprobada correctamente',
                bonus_points_awarded: vr.bonus_points
            });

        } catch (error) {
            console.error('Error al aprobar verificación:', error);
            res.status(500).json({ error: 'Error al aprobar verificación' });
        }
    }
);

// ====================================
// POST /api/verification/:id/reject
// Rechazar solicitud de verificación (admin)
// ====================================
router.post('/:id/reject',
    authenticateToken,
    requireAdmin,
    [
        body('reason').trim().notEmpty().withMessage('Se requiere una razón para el rechazo')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { reason, notes } = req.body;
            const admin_id = req.user.id;

            // Obtener solicitud
            const request = await query(
                `SELECT vr.*, p.title as pin_title
                 FROM verification_requests vr
                 JOIN pins p ON vr.pin_id = p.id
                 WHERE vr.id = $1`,
                [id]
            );

            if (request.rows.length === 0) {
                return res.status(404).json({ error: 'Solicitud no encontrada' });
            }

            const vr = request.rows[0];

            if (vr.status !== 'pending') {
                return res.status(400).json({ error: 'Esta solicitud ya fue procesada' });
            }

            await transaction(async (client) => {
                // Actualizar solicitud
                await client.query(
                    `UPDATE verification_requests
                     SET status = 'rejected',
                         reviewed_by = $1,
                         reviewed_at = NOW(),
                         review_notes = $2,
                         rejection_reason = $3
                     WHERE id = $4`,
                    [admin_id, notes || null, reason, id]
                );

                // Actualizar pin
                await client.query(
                    `UPDATE pins
                     SET verification_status = 'rejected',
                         verified_by = $1,
                         verified_at = NOW(),
                         verification_notes = $2
                     WHERE id = $3`,
                    [admin_id, reason, vr.pin_id]
                );

                // Registrar en log de moderación
                await client.query(
                    `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                     VALUES ($1, 'reject_verification', 'verification', $2, $3)`,
                    [admin_id, id, reason]
                );
            });

            res.json({ message: 'Verificación rechazada' });

        } catch (error) {
            console.error('Error al rechazar verificación:', error);
            res.status(500).json({ error: 'Error al rechazar verificación' });
        }
    }
);

// ====================================
// GET /api/verification/my-requests
// Obtener solicitudes del usuario actual
// ====================================
router.get('/my-requests', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        const result = await query(
            `SELECT vr.id, vr.status, vr.bonus_points, vr.created_at,
                    vr.reviewed_at, vr.rejection_reason,
                    p.id as pin_id, p.title as pin_title, p.image_urls
             FROM verification_requests vr
             JOIN pins p ON vr.pin_id = p.id
             WHERE vr.user_id = $1
             ORDER BY vr.created_at DESC`,
            [user_id]
        );

        res.json({ requests: result.rows });

    } catch (error) {
        console.error('Error al obtener solicitudes:', error);
        res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
});

// ====================================
// POST /api/verification/:pinId/add-images
// Agregar imágenes de verificación a un pin pendiente
// ====================================
router.post('/:pinId/add-images',
    authenticateToken,
    [
        body('images').isArray({ min: 1 }).withMessage('Se requiere al menos una imagen')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { pinId } = req.params;
            const { images } = req.body;
            const user_id = req.user.id;

            // Verificar que el pin pertenece al usuario y está pendiente
            const request = await query(
                `SELECT vr.id FROM verification_requests vr
                 JOIN pins p ON vr.pin_id = p.id
                 WHERE vr.pin_id = $1 AND vr.user_id = $2 AND vr.status = 'pending'`,
                [pinId, user_id]
            );

            if (request.rows.length === 0) {
                return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
            }

            await query(
                `UPDATE verification_requests
                 SET verification_images = $1
                 WHERE id = $2`,
                [images, request.rows[0].id]
            );

            res.json({ message: 'Imágenes agregadas correctamente' });

        } catch (error) {
            console.error('Error al agregar imágenes:', error);
            res.status(500).json({ error: 'Error al agregar imágenes' });
        }
    }
);

module.exports = router;
