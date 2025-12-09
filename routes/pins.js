const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/pins
// Obtener todos los pins (con filtros opcionales)
// ====================================
router.get('/', optionalAuth, async (req, res) => {
    try {
        const {
            category,
            city,
            user_id,
            limit = 50,
            offset = 0,
            featured
        } = req.query;

        let queryText = `
            SELECT
                p.id, p.title, p.description, p.location_name,
                p.latitude, p.longitude, p.image_urls, p.video_url,
                p.likes_count, p.comments_count, p.shares_count,
                p.is_featured, p.created_at,
                u.id as user_id, u.username, u.avatar_url,
                c.name as category_name, c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color,
                ci.name as city_name
            FROM pins p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (category) {
            queryText += ` AND c.name = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (city) {
            queryText += ` AND ci.id = $${paramIndex}`;
            params.push(city);
            paramIndex++;
        }

        if (user_id) {
            queryText += ` AND p.user_id = $${paramIndex}`;
            params.push(user_id);
            paramIndex++;
        }

        if (featured === 'true') {
            queryText += ` AND p.is_featured = true`;
        }

        queryText += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params);

        // Si hay usuario logueado, verificar qué pins ha likeado
        if (req.user) {
            const pinIds = result.rows.map(p => p.id);
            if (pinIds.length > 0) {
                const likes = await query(
                    `SELECT pin_id FROM likes WHERE user_id = $1 AND pin_id = ANY($2)`,
                    [req.user.id, pinIds]
                );
                const likedPinIds = new Set(likes.rows.map(l => l.pin_id));

                result.rows = result.rows.map(pin => ({
                    ...pin,
                    liked_by_user: likedPinIds.has(pin.id)
                }));
            }
        }

        res.json({
            pins: result.rows,
            total: result.rowCount,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error al obtener pins:', error);
        res.status(500).json({ error: 'Error al obtener pins' });
    }
});

// ====================================
// GET /api/pins/:id
// Obtener un pin específico
// ====================================
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT
                p.*,
                u.id as user_id, u.username, u.avatar_url, u.level,
                c.name as category_name, c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color,
                ci.name as city_name, ci.region as city_region
            FROM pins p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE p.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pin no encontrado' });
        }

        const pin = result.rows[0];

        // Verificar si el usuario actual lo ha likeado
        if (req.user) {
            const likeCheck = await query(
                'SELECT id FROM likes WHERE user_id = $1 AND pin_id = $2',
                [req.user.id, id]
            );
            pin.liked_by_user = likeCheck.rows.length > 0;
        }

        res.json({ pin });

    } catch (error) {
        console.error('Error al obtener pin:', error);
        res.status(500).json({ error: 'Error al obtener pin' });
    }
});

// ====================================
// POST /api/pins
// Crear un nuevo pin
// ====================================
router.post('/',
    authenticateToken,
    [
        body('title').trim().notEmpty().withMessage('Título requerido'),
        body('description').trim().notEmpty().withMessage('Descripción requerida'),
        body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),
        body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
        body('category_id').isInt().withMessage('Categoría requerida'),
        body('location_name').optional().trim(),
        body('city_id').optional().isInt(),
        body('shoe_model').optional().trim(),
        body('image_urls').optional().isArray()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const {
                title,
                description,
                latitude,
                longitude,
                category_id,
                location_name,
                city_id,
                shoe_model,
                image_urls,
                video_url
            } = req.body;

            const user_id = req.user.id;
            const points_awarded = 20; // Puntos por crear pin

            // Usar transacción para crear el pin y actualizar puntos
            const result = await transaction(async (client) => {
                // Crear pin
                const pinResult = await client.query(
                    `INSERT INTO pins
                    (user_id, category_id, title, description, location_name, latitude, longitude,
                     city_id, shoe_model, image_urls, video_url, points_awarded)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING *`,
                    [user_id, category_id, title, description, location_name || null,
                        latitude, longitude, city_id || null, shoe_model || null,
                        image_urls || [], video_url || null, points_awarded]
                );

                // Actualizar puntos del usuario
                await client.query(
                    'UPDATE users SET total_points = total_points + $1 WHERE id = $2',
                    [points_awarded, user_id]
                );

                // Si tiene city_id, actualizar user_cities
                if (city_id) {
                    await client.query(
                        `INSERT INTO user_cities (user_id, city_id, pins_count, points_earned)
                         VALUES ($1, $2, 1, $3)
                         ON CONFLICT (user_id, city_id)
                         DO UPDATE SET
                            pins_count = user_cities.pins_count + 1,
                            points_earned = user_cities.points_earned + $3,
                            last_visit = CURRENT_TIMESTAMP`,
                        [user_id, city_id, points_awarded]
                    );
                }

                return pinResult.rows[0];
            });

            res.status(201).json({
                message: `¡Pin creado! Has ganado ${points_awarded} puntos 🎉`,
                pin: result,
                points_earned: points_awarded
            });

        } catch (error) {
            console.error('Error al crear pin:', error);
            res.status(500).json({ error: 'Error al crear pin' });
        }
    }
);

// ====================================
// POST /api/pins/:id/like
// Dar like a un pin
// ====================================
router.post('/:id/like', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        // Verificar si ya existe el like
        const existing = await query(
            'SELECT id FROM likes WHERE user_id = $1 AND pin_id = $2',
            [user_id, id]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Ya has dado like a este pin' });
        }

        // Crear like (el trigger se encarga de incrementar el contador)
        await transaction(async (client) => {
            await client.query(
                'INSERT INTO likes (user_id, pin_id) VALUES ($1, $2)',
                [user_id, id]
            );

            // Dar 5 puntos al usuario que da like
            await client.query(
                'UPDATE users SET total_points = total_points + 5 WHERE id = $1',
                [user_id]
            );
        });

        res.json({ message: '¡+5 puntos! 💖', points_earned: 5 });

    } catch (error) {
        console.error('Error al dar like:', error);
        res.status(500).json({ error: 'Error al dar like' });
    }
});

// ====================================
// DELETE /api/pins/:id/like
// Quitar like de un pin
// ====================================
router.delete('/:id/like', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const result = await query(
            'DELETE FROM likes WHERE user_id = $1 AND pin_id = $2 RETURNING id',
            [user_id, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No has dado like a este pin' });
        }

        res.json({ message: 'Like eliminado' });

    } catch (error) {
        console.error('Error al quitar like:', error);
        res.status(500).json({ error: 'Error al quitar like' });
    }
});

// ====================================
// GET /api/pins/:id/comments
// Obtener comentarios de un pin
// ====================================
router.get('/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT c.*, u.username, u.avatar_url
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.pin_id = $1
             ORDER BY c.created_at DESC`,
            [id]
        );

        res.json({ comments: result.rows });

    } catch (error) {
        console.error('Error al obtener comentarios:', error);
        res.status(500).json({ error: 'Error al obtener comentarios' });
    }
});

// ====================================
// POST /api/pins/:id/comments
// Crear comentario en un pin
// ====================================
router.post('/:id/comments',
    authenticateToken,
    [
        body('content').trim().notEmpty().withMessage('Comentario no puede estar vacío')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { content } = req.body;
            const user_id = req.user.id;

            const result = await query(
                `INSERT INTO comments (user_id, pin_id, content)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [user_id, id, content]
            );

            res.status(201).json({
                message: 'Comentario creado',
                comment: result.rows[0]
            });

        } catch (error) {
            console.error('Error al crear comentario:', error);
            res.status(500).json({ error: 'Error al crear comentario' });
        }
    }
);

module.exports = router;
