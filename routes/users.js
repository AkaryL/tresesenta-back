const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/users/me
// Obtener perfil del usuario actual
// ====================================
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        const userResult = await query(
            `SELECT id, username, email, full_name, avatar_url, total_points, level,
                    profile_color, is_verified_buyer, ranking_position, created_at
             FROM users
             WHERE id = $1`,
            [user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = userResult.rows[0];

        // Obtener estadísticas
        const statsResult = await query(
            `SELECT
                COUNT(DISTINCT p.id) as total_pins,
                COUNT(DISTINCT uc.city_id) as cities_visited
             FROM users u
             LEFT JOIN pins p ON u.id = p.user_id
             LEFT JOIN user_cities uc ON u.id = uc.user_id
             WHERE u.id = $1`,
            [user_id]
        );

        // Obtener medallas
        const badgesResult = await query(
            `SELECT b.id, b.name, b.name_es, b.emoji, b.description, b.image_url, b.rarity, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = $1
             ORDER BY ub.earned_at DESC`,
            [user_id]
        );

        res.json({
            user: {
                ...user,
                stats: {
                    total_pins: parseInt(statsResult.rows[0]?.total_pins || 0),
                    cities_visited: parseInt(statsResult.rows[0]?.cities_visited || 0)
                },
                badges: badgesResult.rows
            }
        });

    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// ====================================
// PUT /api/users/me/profile-color
// Actualizar color del Pasaporte 360
// ====================================
router.put('/me/profile-color',
    authenticateToken,
    [
        body('color').matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color inválido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { color } = req.body;
            const user_id = req.user.id;

            await query(
                `UPDATE users SET profile_color = $1 WHERE id = $2`,
                [color, user_id]
            );

            res.json({ message: 'Color actualizado', color });

        } catch (error) {
            console.error('Error al actualizar color:', error);
            res.status(500).json({ error: 'Error al actualizar color' });
        }
    }
);

// ====================================
// PUT /api/users/me
// Actualizar perfil del usuario
// ====================================
router.put('/me',
    authenticateToken,
    [
        body('full_name').optional().trim().isLength({ min: 2, max: 100 }),
        body('avatar_url').optional().trim().isURL()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { full_name, avatar_url } = req.body;
            const user_id = req.user.id;

            const result = await query(
                `UPDATE users
                 SET full_name = COALESCE($1, full_name),
                     avatar_url = COALESCE($2, avatar_url),
                     updated_at = NOW()
                 WHERE id = $3
                 RETURNING id, username, email, full_name, avatar_url, profile_color`,
                [full_name, avatar_url, user_id]
            );

            res.json({ message: 'Perfil actualizado', user: result.rows[0] });

        } catch (error) {
            console.error('Error al actualizar perfil:', error);
            res.status(500).json({ error: 'Error al actualizar perfil' });
        }
    }
);

// ====================================
// GET /api/users/:username
// Obtener perfil de usuario público
// ====================================
router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;

        const userResult = await query(
            `SELECT id, username, full_name, avatar_url, total_points, level,
                    profile_color, is_verified_buyer, ranking_position, created_at
             FROM users
             WHERE username = $1 AND is_banned = false`,
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = userResult.rows[0];

        // Obtener estadísticas del usuario
        const statsResult = await query(
            `SELECT
                COUNT(DISTINCT p.id) as total_pins,
                COUNT(DISTINCT p.city_id) as cities_visited,
                COUNT(DISTINCT uc.city_id) as cities_with_pins
             FROM users u
             LEFT JOIN pins p ON u.id = p.user_id
             LEFT JOIN user_cities uc ON u.id = uc.user_id
             WHERE u.id = $1
             GROUP BY u.id`,
            [user.id]
        );

        const routesResult = await query(
            `SELECT COUNT(*) as total_routes
             FROM routes
             WHERE creator_id = $1`,
            [user.id]
        );

        // Obtener medallas del usuario
        const badgesResult = await query(
            `SELECT b.id, b.name, b.name_es, b.emoji, b.description, b.image_url, b.rarity, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = $1 AND b.is_active = true
             ORDER BY ub.earned_at DESC`,
            [user.id]
        );

        // Obtener pins recientes
        const pinsResult = await query(
            `SELECT p.id, p.title, p.image_urls, p.likes_count, p.created_at, c.emoji
             FROM pins p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.user_id = $1
             ORDER BY p.created_at DESC
             LIMIT 6`,
            [user.id]
        );

        res.json({
            user: {
                ...user,
                stats: {
                    total_pins: parseInt(statsResult.rows[0]?.total_pins || 0),
                    total_routes: parseInt(routesResult.rows[0]?.total_routes || 0),
                    cities_visited: parseInt(statsResult.rows[0]?.cities_with_pins || 0),
                },
                badges: badgesResult.rows,
                recent_pins: pinsResult.rows
            }
        });

    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// ====================================
// GET /api/users/ranking/top
// Obtener ranking de usuarios
// ====================================
router.get('/ranking/top', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const result = await query(
            `SELECT u.id, u.username, u.full_name, u.avatar_url, u.total_points, u.level,
                    u.profile_color, u.is_verified_buyer,
                    COUNT(DISTINCT p.id) as total_pins,
                    COUNT(DISTINCT ub.badge_id) as total_badges
             FROM users u
             LEFT JOIN pins p ON u.id = p.user_id
             LEFT JOIN user_badges ub ON u.id = ub.user_id
             WHERE u.is_banned = false
             GROUP BY u.id
             ORDER BY u.total_points DESC
             LIMIT $1`,
            [parseInt(limit)]
        );

        res.json({
            ranking: result.rows.map((user, index) => ({
                ...user,
                rank: index + 1
            }))
        });

    } catch (error) {
        console.error('Error al obtener ranking:', error);
        res.status(500).json({ error: 'Error al obtener ranking' });
    }
});

module.exports = router;
