const express = require('express');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/users/:username
// Obtener perfil de usuario público
// ====================================
router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;

        const userResult = await query(
            `SELECT id, username, full_name, avatar_url, total_points, level, ranking_position, created_at
             FROM users
             WHERE username = $1`,
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
            `SELECT b.id, b.name, b.name_es, b.emoji, b.description, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = $1
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
                    COUNT(DISTINCT p.id) as total_pins,
                    COUNT(DISTINCT ub.badge_id) as total_badges
             FROM users u
             LEFT JOIN pins p ON u.id = p.user_id
             LEFT JOIN user_badges ub ON u.id = ub.user_id
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
