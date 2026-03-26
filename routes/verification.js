const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { sendVerificationApprovedEmail, sendVerificationRejectedEmail } = require('../services/email');

const router = express.Router();

// ── Reverse geocode to get Mexican state from lat/lng ──
async function getStateFromCoords(lat, lng) {
    try {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) return null;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.results) {
            for (const result of data.results) {
                for (const comp of result.address_components) {
                    if (comp.types.includes('administrative_area_level_1')) {
                        return comp.long_name;
                    }
                }
            }
        }
        return null;
    } catch (e) {
        console.error('[BADGES] Error reverse geocoding:', e.message);
        return null;
    }
}

// ── Try to unlock a state badge for a user ──
async function tryUnlockStateBadge(client, userId, stateName) {
    if (!stateName) return null;
    // Normalize: Google may return "Estado de México" or "México" etc
    const badge = await client.query(
        `SELECT id, name FROM badges
         WHERE geographic_scope = 'state' AND scope_value = $1 AND is_active = true`,
        [stateName]
    );
    if (badge.rows.length === 0) return null;

    const badgeId = badge.rows[0].id;
    // Check if already earned
    const existing = await client.query(
        `SELECT id FROM user_badges WHERE user_id = $1 AND badge_id = $2`,
        [userId, badgeId]
    );
    if (existing.rows.length > 0) return null;

    // Unlock!
    await client.query(
        `INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES ($1, $2, NOW())`,
        [userId, badgeId]
    );
    console.log(`[BADGES] User ${userId} unlocked "${badge.rows[0].name}" (${stateName})`);
    return badge.rows[0];
}

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
                    p.id as pin_id, p.title as pin_title, p.image_urls as pin_images, p.video_url,
                    p.description as pin_description,
                    p.location_name, p.latitude, p.longitude,
                    p.used_tresesenta, p.shoe_model,
                    c.name_es as category_name, c.emoji as category_emoji,
                    ci.name as city_name,
                    u.id as user_id, u.username, u.avatar_url, u.email,
                    u.is_verified_buyer
             FROM verification_requests vr
             JOIN pins p ON vr.pin_id = p.id
             JOIN users u ON vr.user_id = u.id
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN cities ci ON p.city_id = ci.id
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

            // Get pin data for state badge unlock
            const pinData = await query(
                'SELECT latitude, longitude, state_name FROM pins WHERE id = $1',
                [vr.pin_id]
            );
            const pinInfo = pinData.rows[0];

            let unlockedBadge = null;

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
                         verification_notes = $2,
                         points_awarded = $3
                     WHERE id = $4`,
                    [admin_id, notes || null, vr.bonus_points, vr.pin_id]
                );

                // Dar puntos bonus al usuario
                if (vr.bonus_points > 0) {
                    await client.query(
                        `UPDATE users SET total_points = total_points + $1, coins = coins + $1 WHERE id = $2`,
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

                // Try to unlock state badge based on pin location
                let stateName = pinInfo?.state_name;
                if (!stateName && pinInfo?.latitude && pinInfo?.longitude) {
                    stateName = await getStateFromCoords(pinInfo.latitude, pinInfo.longitude);
                }
                if (stateName) {
                    unlockedBadge = await tryUnlockStateBadge(client, vr.pin_owner_id, stateName);
                }
            });

            // Notificar al creador por email
            const ownerResult = await query(
                'SELECT email, username FROM users WHERE id = $1',
                [vr.pin_owner_id]
            );
            if (ownerResult.rows.length > 0) {
                const owner = ownerResult.rows[0];
                sendVerificationApprovedEmail(owner.email, owner.username, vr.pin_title, vr.bonus_points).catch(() => {});
            }

            // WebSocket: el pin tresesenta ahora es visible en el mapa
            req.app.locals.io?.emit('pin:added', { pin_id: vr.pin_id });
            req.app.locals.io?.emit('verification:updated', { verif_id: id, pin_id: vr.pin_id, status: 'approved' });

            res.json({
                message: 'Verificación aprobada correctamente',
                bonus_points_awarded: vr.bonus_points,
                unlocked_badge: unlockedBadge ? unlockedBadge.name : null
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
                `SELECT vr.*, p.title as pin_title, u.email as user_email, u.username as user_username
                 FROM verification_requests vr
                 JOIN pins p ON vr.pin_id = p.id
                 JOIN users u ON vr.user_id = u.id
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

            // Notificar al creador por email
            sendVerificationRejectedEmail(vr.user_email, vr.user_username, vr.pin_title, reason).catch(() => {});

            // WebSocket: el pin tresesenta sale del mapa
            req.app.locals.io?.emit('pin:removed', { pin_id: vr.pin_id });
            req.app.locals.io?.emit('verification:updated', { verif_id: id, pin_id: vr.pin_id, status: 'rejected' });

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
