const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { sendVerificationRejectedEmail } = require('../services/email');

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
// DELETE /api/admin/badges/:id
// Eliminar una medalla
// ====================================
router.delete('/badges/:id',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { id } = req.params;

            // Remove user_badges references first
            await query('DELETE FROM user_badges WHERE badge_id = $1', [id]);

            const result = await query(
                'DELETE FROM badges WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Medalla no encontrada' });
            }

            res.json({
                message: 'Medalla eliminada',
                badge: result.rows[0]
            });

        } catch (error) {
            console.error('Error al eliminar medalla:', error);
            res.status(500).json({ error: 'Error al eliminar medalla' });
        }
    }
);

// ====================================
// GET /api/admin/categories
// Obtener todas las categorías (admin)
// ====================================
router.get('/categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await query(
            `SELECT c.*, COUNT(p.id) as pins_count
             FROM categories c
             LEFT JOIN pins p ON c.id = p.category_id AND p.is_hidden = false
             GROUP BY c.id
             ORDER BY c.id`
        );
        res.json({ categories: result.rows });
    } catch (error) {
        console.error('Error al obtener categorías:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

// ====================================
// POST /api/admin/categories
// Crear nueva categoría
// ====================================
router.post('/categories',
    authenticateToken,
    requireAdmin,
    [
        body('name').trim().notEmpty().withMessage('Nombre (clave) requerido'),
        body('name_es').trim().notEmpty().withMessage('Nombre en español requerido'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, name_es, emoji, color, description, icon_url } = req.body;
            const admin_id = req.user.id;

            const result = await query(
                `INSERT INTO categories (name, name_es, emoji, color, description, icon_url)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [name, name_es, emoji || '📍', color || '#999999', description || '', icon_url || null]
            );

            await query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                 VALUES ($1, 'create_category', 'category', $2, $3)`,
                [admin_id, result.rows[0].id, `Categoría creada: ${name_es}`]
            );

            res.status(201).json({ message: 'Categoría creada', category: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Ya existe una categoría con ese nombre clave' });
            }
            console.error('Error al crear categoría:', error);
            res.status(500).json({ error: 'Error al crear categoría' });
        }
    }
);

// ====================================
// PUT /api/admin/categories/:id
// Actualizar una categoría
// ====================================
router.put('/categories/:id',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, name_es, emoji, color, description, icon_url } = req.body;
            const admin_id = req.user.id;

            const result = await query(
                `UPDATE categories
                 SET name = COALESCE($1, name),
                     name_es = COALESCE($2, name_es),
                     emoji = COALESCE($3, emoji),
                     color = COALESCE($4, color),
                     description = COALESCE($5, description),
                     icon_url = COALESCE($6, icon_url)
                 WHERE id = $7
                 RETURNING *`,
                [name, name_es, emoji, color, description, icon_url, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }

            await query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                 VALUES ($1, 'update_category', 'category', $2, $3)`,
                [admin_id, id, `Categoría actualizada: ${result.rows[0].name_es}`]
            );

            res.json({ message: 'Categoría actualizada', category: result.rows[0] });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Ya existe una categoría con ese nombre clave' });
            }
            console.error('Error al actualizar categoría:', error);
            res.status(500).json({ error: 'Error al actualizar categoría' });
        }
    }
);

// ====================================
// DELETE /api/admin/categories/:id
// Eliminar una categoría
// ====================================
router.delete('/categories/:id',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { move_to } = req.body || {};
            const admin_id = req.user.id;

            // Verificar pines asociados
            const pinsCheck = await query(
                'SELECT COUNT(*) as count FROM pins WHERE category_id = $1',
                [id]
            );

            const pinsCount = parseInt(pinsCheck.rows[0].count);

            if (pinsCount > 0 && !move_to) {
                return res.status(400).json({
                    error: `No se puede eliminar: tiene ${pinsCount} pines asociados`,
                    pins_count: pinsCount,
                    requires_move: true
                });
            }

            // Mover pines si se indicó categoría destino
            if (pinsCount > 0 && move_to) {
                const targetExists = await query('SELECT id FROM categories WHERE id = $1', [move_to]);
                if (targetExists.rows.length === 0) {
                    return res.status(400).json({ error: 'Categoría destino no encontrada' });
                }
                await query('UPDATE pins SET category_id = $1 WHERE category_id = $2', [move_to, id]);
            }

            const result = await query(
                'DELETE FROM categories WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Categoría no encontrada' });
            }

            await query(
                `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                 VALUES ($1, 'delete_category', 'category', $2, $3)`,
                [admin_id, id, `Categoría eliminada: ${result.rows[0].name_es}`]
            );

            res.json({ message: 'Categoría eliminada', category: result.rows[0] });
        } catch (error) {
            console.error('Error al eliminar categoría:', error);
            res.status(500).json({ error: 'Error al eliminar categoría' });
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

            // WebSocket
            req.app.locals.io?.emit('pin:removed', { pin_id: parseInt(id) });

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

        // WebSocket: el pin vuelve al mapa
        req.app.locals.io?.emit('pin:added', { pin_id: parseInt(id) });

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

// ====================================
// GET /api/admin/historial
// Historial de verificaciones con backfill automático
// ====================================
router.get('/historial', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const admin_id = req.user.id;

        // Obtener username del admin para el backfill
        const adminUser = await query('SELECT username FROM users WHERE id = $1', [admin_id]);
        const adminUsername = adminUser.rows[0]?.username || 'admin';

        // Traer TODOS los pins visibles en el mapa (mismo filtro que GET /api/pins)
        // + su verification_request más reciente si existe
        const pinsResult = await query(`
            SELECT
                p.id          AS pin_id,
                p.title       AS pin_title,
                p.description AS pin_description,
                p.location_name,
                p.latitude,
                p.longitude,
                p.image_urls  AS pin_images,
                p.shoe_model,
                p.used_tresesenta,
                p.points_awarded,
                CASE WHEN p.verification_status = 'none' THEN 'approved' ELSE p.verification_status END AS status,
                p.created_at  AS pin_created_at,
                p.user_id,
                c.name_es     AS category_name,
                c.emoji       AS category_emoji,
                ci.name       AS city_name,
                u.username,
                u.avatar_url,
                u.email       AS user_email,
                vr.id         AS verif_id,
                vr.reviewed_at,
                vr.review_notes,
                vr.rejection_reason,
                vr.verification_images,
                vr.reviewed_by,
                reviewer.username AS reviewer_username
            FROM pins p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            LEFT JOIN verification_requests vr
                ON vr.pin_id = p.id
                AND vr.id = (
                    SELECT id FROM verification_requests
                    WHERE pin_id = p.id
                    ORDER BY created_at DESC
                    LIMIT 1
                )
            LEFT JOIN users reviewer ON vr.reviewed_by = reviewer.id
            WHERE p.is_hidden = false
              AND (p.verification_status = 'approved' OR p.verification_status = 'none')
            ORDER BY COALESCE(vr.reviewed_at, p.created_at) DESC
        `);

        // Backfill: crear verification_request para pins sin registro
        const toBackfill = pinsResult.rows.filter(r => !r.verif_id);

        for (const pin of toBackfill) {
            await query(`
                INSERT INTO verification_requests
                    (pin_id, user_id, status, reviewed_by, reviewed_at, review_notes)
                VALUES ($1, $2, 'approved', $3, NOW(), 'Aprobado (historial)')
            `, [pin.pin_id, pin.user_id, admin_id]);
        }

        // Rellenar en memoria los pins que se acaban de backfill-ear
        const historial = pinsResult.rows.map(r => {
            if (!r.verif_id) {
                return {
                    ...r,
                    status: 'approved',
                    reviewer_username: adminUsername,
                    reviewed_at: new Date().toISOString(),
                    review_notes: 'Aprobado (historial)',
                };
            }
            return r;
        });

        res.json({ historial, backfilled: toBackfill.length });

    } catch (error) {
        console.error('Error al obtener historial:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// ====================================
// POST /api/admin/historial/:pin_id/reject
// Rechazar un pin aprobado desde el historial
// ====================================
router.post('/historial/:pin_id/reject',
    authenticateToken,
    requireAdmin,
    [body('reason').trim().notEmpty().withMessage('Se requiere una razón')],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { pin_id } = req.params;
            const { reason } = req.body;
            const admin_id = req.user.id;

            // Obtener pin + dueño
            const pinResult = await query(`
                SELECT p.*, u.email as user_email, u.username as user_username
                FROM pins p
                JOIN users u ON p.user_id = u.id
                WHERE p.id = $1
            `, [pin_id]);

            if (!pinResult.rows.length) {
                return res.status(404).json({ error: 'Pin no encontrado' });
            }

            const pin = pinResult.rows[0];

            if (pin.verification_status === 'rejected') {
                return res.status(400).json({ error: 'Este pin ya está rechazado' });
            }

            await transaction(async (client) => {
                // Pins tresesenta: marcar como rejected
                // Pins regulares: ocultarlos (is_hidden = true)
                if (pin.used_tresesenta) {
                    await client.query(
                        `UPDATE pins SET verification_status = 'rejected', verified_by = $1, verified_at = NOW(), verification_notes = $2 WHERE id = $3`,
                        [admin_id, reason, pin_id]
                    );
                } else {
                    await client.query(
                        `UPDATE pins SET is_hidden = true, hidden_reason = $1 WHERE id = $2`,
                        [reason, pin_id]
                    );
                }

                // Actualizar o crear verification_request
                const vr = await client.query(
                    `SELECT id FROM verification_requests WHERE pin_id = $1 ORDER BY created_at DESC LIMIT 1`,
                    [pin_id]
                );

                if (vr.rows.length > 0) {
                    await client.query(
                        `UPDATE verification_requests
                         SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
                         WHERE id = $3`,
                        [admin_id, reason, vr.rows[0].id]
                    );
                } else {
                    await client.query(
                        `INSERT INTO verification_requests (pin_id, user_id, status, reviewed_by, reviewed_at, rejection_reason)
                         VALUES ($1, $2, 'rejected', $3, NOW(), $4)`,
                        [pin_id, pin.user_id, admin_id, reason]
                    );
                }

                // Log de moderación
                await client.query(
                    `INSERT INTO moderation_logs (admin_id, action_type, target_type, target_id, reason)
                     VALUES ($1, 'reject_from_historial', 'pin', $2, $3)`,
                    [admin_id, pin_id, reason]
                );
            });

            // Notificar al creador
            sendVerificationRejectedEmail(pin.user_email, pin.user_username, pin.title, reason).catch(() => {});

            // WebSocket: el pin sale del mapa
            req.app.locals.io?.emit('pin:removed', { pin_id: parseInt(pin_id) });

            res.json({ message: 'Pin rechazado y removido del mapa' });

        } catch (error) {
            console.error('Error al rechazar desde historial:', error);
            res.status(500).json({ error: 'Error al rechazar' });
        }
    }
);

module.exports = router;
