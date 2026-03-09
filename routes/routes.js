const express = require('express');
const { query } = require('../config/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/routes
// Obtener todas las rutas
// ====================================
router.get('/', async (req, res) => {
    try {
        const { official, limit = 20 } = req.query;

        let queryText = `
            SELECT r.id, r.title, r.description, r.emoji, r.total_pins,
                   r.total_points, r.completions_count, r.difficulty,
                   r.estimated_time, r.is_official, r.created_at,
                   r.cover_image_url,
                   u.username as creator_username
            FROM routes r
            LEFT JOIN users u ON r.creator_id = u.id
            WHERE 1=1
        `;

        const params = [];
        if (official === 'true') {
            queryText += ' AND r.is_official = true';
        }

        queryText += ' ORDER BY r.completions_count DESC, r.created_at DESC LIMIT $1';
        params.push(parseInt(limit));

        const result = await query(queryText, params);

        res.json({ routes: result.rows });

    } catch (error) {
        console.error('Error al obtener rutas:', error);
        res.status(500).json({ error: 'Error al obtener rutas' });
    }
});

// ====================================
// GET /api/routes/:id
// Obtener una ruta específica con sus pins
// ====================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const routeResult = await query(
            `SELECT r.*, u.username as creator_username, u.avatar_url as creator_avatar
             FROM routes r
             LEFT JOIN users u ON r.creator_id = u.id
             WHERE r.id = $1`,
            [id]
        );

        if (routeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }

        const route = routeResult.rows[0];

        // Obtener pins de la ruta
        const pinsResult = await query(
            `SELECT p.id, p.title, p.description, p.location_name, p.latitude,
                    p.longitude, p.image_urls, p.likes_count, rp.order_index, rp.is_required,
                    c.emoji as category_emoji, c.color as category_color
             FROM route_pins rp
             JOIN pins p ON rp.pin_id = p.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE rp.route_id = $1
             ORDER BY rp.order_index ASC`,
            [id]
        );

        route.pins = pinsResult.rows;

        res.json({ route });

    } catch (error) {
        console.error('Error al obtener ruta:', error);
        res.status(500).json({ error: 'Error al obtener ruta' });
    }
});

// ====================================
// POST /api/routes
// Crear una nueva ruta
// ====================================
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { title, description, emoji, difficulty, estimated_time, pin_ids } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Título requerido' });
        }
        if (!pin_ids || !Array.isArray(pin_ids) || pin_ids.length === 0) {
            return res.status(400).json({ error: 'Agrega al menos un pin a la ruta' });
        }

        // Create route
        const routeResult = await query(
            `INSERT INTO routes (creator_id, title, description, emoji, difficulty, estimated_time, total_pins, is_official)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false)
             RETURNING *`,
            [req.user.id, title.trim(), description?.trim() || '', emoji || '🗺️',
             difficulty || null, estimated_time?.trim() || null, pin_ids.length]
        );

        const route = routeResult.rows[0];

        // Insert route_pins
        for (let i = 0; i < pin_ids.length; i++) {
            await query(
                `INSERT INTO route_pins (route_id, pin_id, order_index, is_required)
                 VALUES ($1, $2, $3, true)
                 ON CONFLICT (route_id, pin_id) DO NOTHING`,
                [route.id, pin_ids[i], i + 1]
            );
        }

        res.status(201).json({ route });

    } catch (error) {
        console.error('Error al crear ruta:', error);
        res.status(500).json({ error: 'Error al crear ruta' });
    }
});

// ====================================
// GET /api/routes/my/pins
// Obtener los pins del usuario para armar rutas
// ====================================
router.get('/my/pins', authenticateToken, async (req, res) => {
    try {
        const result = await query(
            `SELECT p.id, p.title, p.location_name, p.latitude, p.longitude, p.image_urls,
                    c.emoji as category_emoji, c.color as category_color
             FROM pins p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.user_id = $1
             ORDER BY p.created_at DESC`,
            [req.user.id]
        );
        res.json({ pins: result.rows });
    } catch (error) {
        console.error('Error al obtener pins del usuario:', error);
        res.status(500).json({ error: 'Error al obtener pins' });
    }
});

module.exports = router;
