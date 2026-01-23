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
// GET /api/admin/settings
// Obtener todas las configuraciones
// ====================================
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { category } = req.query;

        let queryText = `
            SELECT id, setting_key, setting_value, description, category, updated_at
            FROM admin_settings
        `;
        const params = [];

        if (category) {
            queryText += ` WHERE category = $1`;
            params.push(category);
        }

        queryText += ` ORDER BY category, setting_key`;

        const result = await query(queryText, params);

        // Agrupar por categoría
        const grouped = result.rows.reduce((acc, setting) => {
            if (!acc[setting.category]) {
                acc[setting.category] = [];
            }
            acc[setting.category].push(setting);
            return acc;
        }, {});

        res.json({ settings: grouped });

    } catch (error) {
        console.error('Error al obtener configuraciones:', error);
        res.status(500).json({ error: 'Error al obtener configuraciones' });
    }
});

// ====================================
// PUT /api/admin/settings/:key
// Actualizar una configuración
// ====================================
router.put('/settings/:key',
    authenticateToken,
    requireAdmin,
    [
        body('value').exists().withMessage('Se requiere un valor')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { key } = req.params;
            const { value } = req.body;
            const admin_id = req.user.id;

            const result = await query(
                `UPDATE admin_settings
                 SET setting_value = $1, updated_by = $2, updated_at = NOW()
                 WHERE setting_key = $3
                 RETURNING *`,
                [JSON.stringify({ value }), admin_id, key]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Configuración no encontrada' });
            }

            // Log de moderación
            await query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason, metadata)
                 VALUES ($1, 'update_setting', 'setting', 0, $2, $3)`,
                [admin_id, `Actualizado: ${key}`, JSON.stringify({ key, value })]
            );

            res.json({
                message: 'Configuración actualizada',
                setting: result.rows[0]
            });

        } catch (error) {
            console.error('Error al actualizar configuración:', error);
            res.status(500).json({ error: 'Error al actualizar configuración' });
        }
    }
);

// ====================================
// GET /api/admin/point-actions
// Obtener todas las acciones de puntos
// ====================================
router.get('/point-actions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM point_actions ORDER BY category, action_code`
        );

        res.json({ actions: result.rows });

    } catch (error) {
        console.error('Error al obtener acciones:', error);
        res.status(500).json({ error: 'Error al obtener acciones' });
    }
});

// ====================================
// PUT /api/admin/point-actions/:id
// Actualizar una acción de puntos
// ====================================
router.put('/point-actions/:id',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const {
                points, daily_limit, cooldown_seconds, is_active,
                tresesenta_bonus, verified_buyer_multiplier
            } = req.body;

            const result = await query(
                `UPDATE point_actions
                 SET points = COALESCE($1, points),
                     daily_limit = COALESCE($2, daily_limit),
                     cooldown_seconds = COALESCE($3, cooldown_seconds),
                     is_active = COALESCE($4, is_active),
                     tresesenta_bonus = COALESCE($5, tresesenta_bonus),
                     verified_buyer_multiplier = COALESCE($6, verified_buyer_multiplier),
                     updated_at = NOW()
                 WHERE id = $7
                 RETURNING *`,
                [points, daily_limit, cooldown_seconds, is_active,
                 tresesenta_bonus, verified_buyer_multiplier, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Acción no encontrada' });
            }

            res.json({
                message: 'Acción actualizada',
                action: result.rows[0]
            });

        } catch (error) {
            console.error('Error al actualizar acción:', error);
            res.status(500).json({ error: 'Error al actualizar acción' });
        }
    }
);

// ====================================
// GET /api/admin/badges
// Obtener todas las medallas
// ====================================
router.get('/badges', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await query(
            `SELECT b.*, COUNT(ub.id) as users_with_badge
             FROM badges b
             LEFT JOIN user_badges ub ON b.id = ub.badge_id
             GROUP BY b.id
             ORDER BY b.display_order, b.name`
        );

        res.json({ badges: result.rows });

    } catch (error) {
        console.error('Error al obtener medallas:', error);
        res.status(500).json({ error: 'Error al obtener medallas' });
    }
});

// ====================================
// PUT /api/admin/badges/:id
// Actualizar una medalla
// ====================================
router.put('/badges/:id',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const {
                name_es, description, points_reward, is_active,
                geographic_scope, display_order, rarity, image_url
            } = req.body;

            const result = await query(
                `UPDATE badges
                 SET name_es = COALESCE($1, name_es),
                     description = COALESCE($2, description),
                     points_reward = COALESCE($3, points_reward),
                     is_active = COALESCE($4, is_active),
                     geographic_scope = COALESCE($5, geographic_scope),
                     display_order = COALESCE($6, display_order),
                     rarity = COALESCE($7, rarity),
                     image_url = COALESCE($8, image_url),
                     updated_at = NOW()
                 WHERE id = $9
                 RETURNING *`,
                [name_es, description, points_reward, is_active,
                 geographic_scope, display_order, rarity, image_url, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Medalla no encontrada' });
            }

            res.json({
                message: 'Medalla actualizada',
                badge: result.rows[0]
            });

        } catch (error) {
            console.error('Error al actualizar medalla:', error);
            res.status(500).json({ error: 'Error al actualizar medalla' });
        }
    }
);

// ====================================
// POST /api/admin/badges
// Crear nueva medalla
// ====================================
router.post('/badges',
    authenticateToken,
    requireAdmin,
    [
        body('name').trim().notEmpty().withMessage('Nombre requerido'),
        body('name_es').trim().notEmpty().withMessage('Nombre en español requerido'),
        body('condition_type').trim().notEmpty().withMessage('Tipo de condición requerido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const {
                name, name_es, description, emoji, points_required, points_reward,
                condition_type, condition_value, image_url, geographic_scope,
                category, rarity, display_order
            } = req.body;

            const result = await query(
                `INSERT INTO badges
                 (name, name_es, description, emoji, points_required, points_reward,
                  condition_type, condition_value, image_url, geographic_scope,
                  category, rarity, display_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING *`,
                [name, name_es, description, emoji, points_required || 0, points_reward || 0,
                 condition_type, JSON.stringify(condition_value || {}), image_url,
                 geographic_scope || 'national', category || 'general', rarity || 'common',
                 display_order || 0]
            );

            res.status(201).json({
                message: 'Medalla creada',
                badge: result.rows[0]
            });

        } catch (error) {
            console.error('Error al crear medalla:', error);
            res.status(500).json({ error: 'Error al crear medalla' });
        }
    }
);

// ====================================
// GET /api/admin/users
// Obtener lista de usuarios (admin)
// ====================================
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 50, offset = 0, search, banned } = req.query;

        let queryText = `
            SELECT id, username, email, full_name, avatar_url,
                   total_points, level, is_admin, is_verified_buyer,
                   is_banned, ban_reason, created_at
            FROM users
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (search) {
            queryText += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (banned === 'true') {
            queryText += ` AND is_banned = true`;
        } else if (banned === 'false') {
            queryText += ` AND is_banned = false`;
        }

        queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params);

        res.json({ users: result.rows });

    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// ====================================
// POST /api/admin/users/:id/ban
// Banear usuario
// ====================================
router.post('/users/:id/ban',
    authenticateToken,
    requireAdmin,
    [
        body('reason').trim().notEmpty().withMessage('Se requiere una razón')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { reason } = req.body;
            const admin_id = req.user.id;

            // No permitir banearse a sí mismo
            if (parseInt(id) === admin_id) {
                return res.status(400).json({ error: 'No puedes banearte a ti mismo' });
            }

            await transaction(async (client) => {
                await client.query(
                    `UPDATE users SET is_banned = true, ban_reason = $1 WHERE id = $2`,
                    [reason, id]
                );

                await client.query(
                    `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                     VALUES ($1, 'ban_user', 'user', $2, $3)`,
                    [admin_id, id, reason]
                );
            });

            res.json({ message: 'Usuario baneado' });

        } catch (error) {
            console.error('Error al banear usuario:', error);
            res.status(500).json({ error: 'Error al banear usuario' });
        }
    }
);

// ====================================
// POST /api/admin/users/:id/unban
// Desbanear usuario
// ====================================
router.post('/users/:id/unban', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const admin_id = req.user.id;

        await transaction(async (client) => {
            await client.query(
                `UPDATE users SET is_banned = false, ban_reason = NULL WHERE id = $1`,
                [id]
            );

            await client.query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                 VALUES ($1, 'unban_user', 'user', $2, 'Desbaneado')`,
                [admin_id, id]
            );
        });

        res.json({ message: 'Usuario desbaneado' });

    } catch (error) {
        console.error('Error al desbanear usuario:', error);
        res.status(500).json({ error: 'Error al desbanear usuario' });
    }
});

// ====================================
// POST /api/admin/users/:id/set-admin
// Hacer admin a un usuario
// ====================================
router.post('/users/:id/set-admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_admin } = req.body;
        const admin_id = req.user.id;

        await transaction(async (client) => {
            await client.query(
                `UPDATE users SET is_admin = $1 WHERE id = $2`,
                [is_admin, id]
            );

            await client.query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                 VALUES ($1, $2, 'user', $3, $4)`,
                [admin_id, is_admin ? 'grant_admin' : 'revoke_admin', id,
                 is_admin ? 'Permisos de admin otorgados' : 'Permisos de admin revocados']
            );
        });

        res.json({ message: is_admin ? 'Admin otorgado' : 'Admin revocado' });

    } catch (error) {
        console.error('Error al cambiar permisos:', error);
        res.status(500).json({ error: 'Error al cambiar permisos' });
    }
});

// ====================================
// POST /api/admin/users/:id/verify-buyer
// Marcar usuario como comprador verificado
// ====================================
router.post('/users/:id/verify-buyer', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_verified } = req.body;
        const admin_id = req.user.id;

        await transaction(async (client) => {
            await client.query(
                `UPDATE users SET is_verified_buyer = $1 WHERE id = $2`,
                [is_verified, id]
            );

            // Si se verifica, dar puntos
            if (is_verified) {
                await client.query(
                    `SELECT record_point_transaction($1, 'verified_purchase', NULL, NULL, false, 'Compra TRESESENTA verificada')`,
                    [id]
                );
            }

            await client.query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                 VALUES ($1, $2, 'user', $3, $4)`,
                [admin_id, is_verified ? 'verify_buyer' : 'unverify_buyer', id,
                 is_verified ? 'Comprador verificado' : 'Verificación removida']
            );
        });

        res.json({ message: is_verified ? 'Comprador verificado' : 'Verificación removida' });

    } catch (error) {
        console.error('Error al verificar comprador:', error);
        res.status(500).json({ error: 'Error al verificar comprador' });
    }
});

// ====================================
// GET /api/admin/pins
// Obtener pins para moderación
// ====================================
router.get('/pins', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 50, offset = 0, hidden, verification_status } = req.query;

        let queryText = `
            SELECT p.*, u.username, u.email,
                   c.name_es as category_name
            FROM pins p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (hidden === 'true') {
            queryText += ` AND p.is_hidden = true`;
        }

        if (verification_status) {
            queryText += ` AND p.verification_status = $${paramIndex}`;
            params.push(verification_status);
            paramIndex++;
        }

        queryText += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params);

        res.json({ pins: result.rows });

    } catch (error) {
        console.error('Error al obtener pins:', error);
        res.status(500).json({ error: 'Error al obtener pins' });
    }
});

// ====================================
// POST /api/admin/pins/:id/hide
// Ocultar un pin
// ====================================
router.post('/pins/:id/hide',
    authenticateToken,
    requireAdmin,
    [
        body('reason').trim().notEmpty().withMessage('Se requiere una razón')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { reason } = req.body;
            const admin_id = req.user.id;

            await transaction(async (client) => {
                await client.query(
                    `UPDATE pins SET is_hidden = true, hidden_reason = $1 WHERE id = $2`,
                    [reason, id]
                );

                await client.query(
                    `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                     VALUES ($1, 'hide_pin', 'pin', $2, $3)`,
                    [admin_id, id, reason]
                );
            });

            res.json({ message: 'Pin ocultado' });

        } catch (error) {
            console.error('Error al ocultar pin:', error);
            res.status(500).json({ error: 'Error al ocultar pin' });
        }
    }
);

// ====================================
// POST /api/admin/pins/:id/unhide
// Mostrar un pin oculto
// ====================================
router.post('/pins/:id/unhide', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const admin_id = req.user.id;

        await transaction(async (client) => {
            await client.query(
                `UPDATE pins SET is_hidden = false, hidden_reason = NULL WHERE id = $1`,
                [id]
            );

            await client.query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                 VALUES ($1, 'unhide_pin', 'pin', $2, 'Pin restaurado')`,
                [admin_id, id]
            );
        });

        res.json({ message: 'Pin restaurado' });

    } catch (error) {
        console.error('Error al restaurar pin:', error);
        res.status(500).json({ error: 'Error al restaurar pin' });
    }
});

// ====================================
// GET /api/admin/moderation-logs
// Obtener logs de moderación
// ====================================
router.get('/moderation-logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 100, offset = 0, action_type } = req.query;

        let queryText = `
            SELECT ml.*, u.username as admin_username
            FROM moderation_logs ml
            LEFT JOIN users u ON ml.admin_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (action_type) {
            queryText += ` AND ml.action_type = $${paramIndex}`;
            params.push(action_type);
            paramIndex++;
        }

        queryText += ` ORDER BY ml.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params);

        res.json({ logs: result.rows });

    } catch (error) {
        console.error('Error al obtener logs:', error);
        res.status(500).json({ error: 'Error al obtener logs' });
    }
});

// ====================================
// GET /api/admin/stats
// Estadísticas generales del sistema
// ====================================
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [users, pins, verifications, points] = await Promise.all([
            query(`SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
                COUNT(*) FILTER (WHERE is_banned = true) as banned,
                COUNT(*) FILTER (WHERE is_verified_buyer = true) as verified_buyers
                FROM users`),
            query(`SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
                COUNT(*) FILTER (WHERE is_hidden = true) as hidden,
                COUNT(*) FILTER (WHERE used_tresesenta = true) as with_tresesenta
                FROM pins`),
            query(`SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'approved') as approved,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejected
                FROM verification_requests`),
            query(`SELECT
                SUM(points) FILTER (WHERE points > 0) as total_earned,
                SUM(points) FILTER (WHERE created_at >= CURRENT_DATE) as today_earned
                FROM point_transactions`)
        ]);

        res.json({
            users: users.rows[0],
            pins: pins.rows[0],
            verifications: verifications.rows[0],
            points: points.rows[0]
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

module.exports = router;
