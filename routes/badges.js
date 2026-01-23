const express = require('express');
const { query } = require('../config/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/badges
// Obtener todas las medallas disponibles
// ====================================
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { category, rarity } = req.query;

        let queryText = `
            SELECT id, name, name_es, description, emoji, points_required, points_reward,
                   image_url, category, rarity, geographic_scope, display_order
             FROM badges
             WHERE is_active = true
        `;
        const params = [];
        let paramIndex = 1;

        if (category) {
            queryText += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (rarity) {
            queryText += ` AND rarity = $${paramIndex}`;
            params.push(rarity);
            paramIndex++;
        }

        queryText += ` ORDER BY display_order ASC, points_required ASC`;

        const result = await query(queryText, params);

        // Si hay usuario logueado, marcar cuáles tiene
        let badges = result.rows;
        if (req.user) {
            const userBadges = await query(
                `SELECT badge_id, earned_at FROM user_badges WHERE user_id = $1`,
                [req.user.id]
            );
            const earnedMap = new Map(userBadges.rows.map(ub => [ub.badge_id, ub.earned_at]));

            badges = badges.map(b => ({
                ...b,
                earned: earnedMap.has(b.id),
                earned_at: earnedMap.get(b.id) || null
            }));
        }

        res.json({ badges });

    } catch (error) {
        console.error('Error al obtener badges:', error);
        res.status(500).json({ error: 'Error al obtener badges' });
    }
});

// ====================================
// GET /api/badges/categories
// Obtener categorías de medallas
// ====================================
router.get('/categories', async (req, res) => {
    try {
        const result = await query(
            `SELECT DISTINCT category, COUNT(*) as count
             FROM badges
             WHERE is_active = true
             GROUP BY category
             ORDER BY category`
        );

        res.json({ categories: result.rows });

    } catch (error) {
        console.error('Error al obtener categorías:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

// ====================================
// GET /api/badges/me
// Obtener medallas del usuario actual
// ====================================
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        const result = await query(
            `SELECT b.id, b.name, b.name_es, b.description, b.emoji, b.image_url,
                    b.category, b.rarity, b.points_reward, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = $1 AND b.is_active = true
             ORDER BY ub.earned_at DESC`,
            [user_id]
        );

        // Obtener progreso hacia próximas medallas
        const progressResult = await query(
            `SELECT b.id, b.name_es, b.emoji, b.condition_type, b.condition_value,
                    b.category, b.rarity
             FROM badges b
             WHERE b.is_active = true
               AND b.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = $1)
             ORDER BY b.display_order
             LIMIT 5`,
            [user_id]
        );

        res.json({
            badges: result.rows,
            progress: progressResult.rows
        });

    } catch (error) {
        console.error('Error al obtener badges del usuario:', error);
        res.status(500).json({ error: 'Error al obtener badges' });
    }
});

// ====================================
// GET /api/badges/:id
// Obtener detalle de una medalla
// ====================================
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT b.*, COUNT(ub.id) as total_earned
             FROM badges b
             LEFT JOIN user_badges ub ON b.id = ub.badge_id
             WHERE b.id = $1
             GROUP BY b.id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Medalla no encontrada' });
        }

        const badge = result.rows[0];

        // Si hay usuario logueado, verificar si la tiene
        if (req.user) {
            const userCheck = await query(
                `SELECT earned_at FROM user_badges WHERE user_id = $1 AND badge_id = $2`,
                [req.user.id, id]
            );
            badge.earned = userCheck.rows.length > 0;
            badge.earned_at = userCheck.rows[0]?.earned_at || null;
        }

        // Últimos usuarios en obtenerla
        const recentEarners = await query(
            `SELECT u.id, u.username, u.avatar_url, ub.earned_at
             FROM user_badges ub
             JOIN users u ON ub.user_id = u.id
             WHERE ub.badge_id = $1 AND u.is_banned = false
             ORDER BY ub.earned_at DESC
             LIMIT 10`,
            [id]
        );

        res.json({
            badge,
            recent_earners: recentEarners.rows
        });

    } catch (error) {
        console.error('Error al obtener badge:', error);
        res.status(500).json({ error: 'Error al obtener badge' });
    }
});

module.exports = router;
