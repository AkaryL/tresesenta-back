const express = require('express');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/badges
// Obtener todas las medallas disponibles
// ====================================
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT id, name, name_es, description, emoji, points_required, image_url
             FROM badges
             ORDER BY points_required ASC`
        );

        res.json({ badges: result.rows });

    } catch (error) {
        console.error('Error al obtener badges:', error);
        res.status(500).json({ error: 'Error al obtener badges' });
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
            `SELECT b.*, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON ub.badge_id = b.id
             WHERE ub.user_id = $1
             ORDER BY ub.earned_at DESC`,
            [user_id]
        );

        res.json({ badges: result.rows });

    } catch (error) {
        console.error('Error al obtener badges del usuario:', error);
        res.status(500).json({ error: 'Error al obtener badges' });
    }
});

module.exports = router;
