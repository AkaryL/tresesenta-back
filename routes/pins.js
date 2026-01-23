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
            featured,
            with_tresesenta
        } = req.query;

        let queryText = `
            SELECT
                p.id, p.title, p.description, p.location_name,
                p.latitude, p.longitude, p.image_urls, p.video_url,
                p.likes_count, p.comments_count, p.shares_count,
                p.is_featured, p.created_at,
                p.used_tresesenta, p.verification_status,
                u.id as user_id, u.username, u.avatar_url, u.is_verified_buyer,
                c.name as category_name, c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color,
                ci.name as city_name
            FROM pins p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE p.is_hidden = false
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

        if (with_tresesenta === 'true') {
            queryText += ` AND p.used_tresesenta = true AND p.verification_status = 'approved'`;
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
                u.id as user_id, u.username, u.avatar_url, u.level, u.is_verified_buyer, u.profile_color,
                c.name as category_name, c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color,
                ci.name as city_name, ci.region as city_region
            FROM pins p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE p.id = $1 AND p.is_hidden = false`,
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

            // Si es su propio pin, incluir info de verificación pendiente
            if (req.user.id === pin.user_id && pin.verification_status === 'pending') {
                const verificationRequest = await query(
                    `SELECT id, status, created_at FROM verification_requests
                     WHERE pin_id = $1 AND user_id = $2`,
                    [id, req.user.id]
                );
                pin.verification_request = verificationRequest.rows[0] || null;
            }
        }

        res.json({ pin });

    } catch (error) {
        console.error('Error al obtener pin:', error);
        res.status(500).json({ error: 'Error al obtener pin' });
    }
});

// ====================================
// POST /api/pins
// Crear un nuevo pin (con soporte para verificación TRESESENTA)
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
        body('image_urls').optional().isArray(),
        body('used_tresesenta').optional().isBoolean()
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
                video_url,
                used_tresesenta = false
            } = req.body;

            const user_id = req.user.id;

            // Verificar límite diario
            const limitCheck = await query(
                `SELECT check_daily_limit($1, 'pin') as allowed`,
                [user_id]
            );

            if (!limitCheck.rows[0]?.allowed) {
                return res.status(429).json({
                    error: 'Has alcanzado el límite diario de pins. Intenta mañana.'
                });
            }

            // Determinar acción de puntos según contenido
            let action_code = 'create_pin';
            if (image_urls && image_urls.length > 0) {
                action_code = 'create_pin_with_photo';
            }
            if (video_url) {
                action_code = 'create_pin_with_video';
            }

            // Obtener puntos de la acción configurada
            const actionResult = await query(
                `SELECT * FROM point_actions WHERE action_code = $1 AND is_active = true`,
                [action_code]
            );
            const action = actionResult.rows[0];
            let base_points = action?.points || 20;
            let tresesenta_bonus = action?.tresesenta_bonus || 0;

            // Determinar estado de verificación
            let verification_status = 'none';
            if (used_tresesenta) {
                // Verificar si el usuario es comprador verificado (auto-aprobar)
                const userCheck = await query(
                    `SELECT is_verified_buyer FROM users WHERE id = $1`,
                    [user_id]
                );
                const autoApprove = await query(
                    `SELECT setting_value->>'value' as value FROM admin_settings
                     WHERE setting_key = 'auto_approve_verified_buyers'`
                );

                if (userCheck.rows[0]?.is_verified_buyer && autoApprove.rows[0]?.value === 'true') {
                    verification_status = 'approved';
                } else {
                    verification_status = 'pending';
                }
            }

            // Calcular puntos totales
            let points_awarded = base_points;
            if (used_tresesenta && verification_status === 'approved') {
                points_awarded += tresesenta_bonus;
            }

            // Usar transacción para crear el pin y actualizar puntos
            const result = await transaction(async (client) => {
                // Crear pin
                const pinResult = await client.query(
                    `INSERT INTO pins
                    (user_id, category_id, title, description, location_name, latitude, longitude,
                     city_id, shoe_model, image_urls, video_url, points_awarded,
                     used_tresesenta, verification_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING *`,
                    [user_id, category_id, title, description, location_name || null,
                        latitude, longitude, city_id || null, shoe_model || null,
                        image_urls || [], video_url || null, points_awarded,
                        used_tresesenta, verification_status]
                );

                const pin = pinResult.rows[0];

                // Registrar transacción de puntos
                await client.query(
                    `SELECT record_point_transaction($1, $2, $3, NULL, $4, $5)`,
                    [user_id, action_code, pin.id, used_tresesenta && verification_status === 'approved', `Pin creado: ${title}`]
                );

                // Incrementar estadísticas diarias
                await client.query(
                    `SELECT increment_daily_stat($1, 'pin')`,
                    [user_id]
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

                // Si marcó used_tresesenta y está pendiente, crear solicitud de verificación
                if (used_tresesenta && verification_status === 'pending') {
                    await client.query(
                        `INSERT INTO verification_requests (pin_id, user_id, bonus_points)
                         VALUES ($1, $2, $3)`,
                        [pin.id, user_id, tresesenta_bonus]
                    );
                }

                return pin;
            });

            let message = `¡Pin creado! Has ganado ${points_awarded} puntos`;
            if (used_tresesenta && verification_status === 'pending') {
                message += '. Tu verificación TRESESENTA está pendiente de aprobación.';
            } else if (used_tresesenta && verification_status === 'approved') {
                message += ` (incluye +${tresesenta_bonus} bonus TRESESENTA)`;
            }

            res.status(201).json({
                message,
                pin: result,
                points_earned: points_awarded,
                verification_status
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

        // Verificar límite diario
        const limitCheck = await query(
            `SELECT check_daily_limit($1, 'like') as allowed`,
            [user_id]
        );

        if (!limitCheck.rows[0]?.allowed) {
            return res.status(429).json({
                error: 'Has alcanzado el límite diario de likes. Intenta mañana.'
            });
        }

        // Verificar si ya existe el like
        const existing = await query(
            'SELECT id FROM likes WHERE user_id = $1 AND pin_id = $2',
            [user_id, id]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Ya has dado like a este pin' });
        }

        // Obtener dueño del pin para dar puntos
        const pinOwner = await query(
            'SELECT user_id FROM pins WHERE id = $1',
            [id]
        );

        // Crear like y registrar puntos
        await transaction(async (client) => {
            await client.query(
                'INSERT INTO likes (user_id, pin_id) VALUES ($1, $2)',
                [user_id, id]
            );

            // Puntos para quien da like
            await client.query(
                `SELECT record_point_transaction($1, 'like_pin', $2, NULL, false, 'Diste like')`,
                [user_id, id]
            );

            // Puntos para quien recibe like (si no es el mismo usuario)
            if (pinOwner.rows[0] && pinOwner.rows[0].user_id !== user_id) {
                await client.query(
                    `SELECT record_point_transaction($1, 'receive_like', $2, $3, false, 'Recibiste un like')`,
                    [pinOwner.rows[0].user_id, id, user_id]
                );
            }

            // Incrementar estadísticas diarias
            await client.query(
                `SELECT increment_daily_stat($1, 'like')`,
                [user_id]
            );
        });

        res.json({ message: '¡Like registrado!', liked: true });

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

            // Verificar límite diario
            const limitCheck = await query(
                `SELECT check_daily_limit($1, 'comment') as allowed`,
                [user_id]
            );

            if (!limitCheck.rows[0]?.allowed) {
                return res.status(429).json({
                    error: 'Has alcanzado el límite diario de comentarios. Intenta mañana.'
                });
            }

            // Verificar cooldown
            const cooldownCheck = await query(
                `SELECT last_comment_at FROM user_daily_stats
                 WHERE user_id = $1 AND stat_date = CURRENT_DATE`,
                [user_id]
            );

            if (cooldownCheck.rows[0]?.last_comment_at) {
                const cooldownSetting = await query(
                    `SELECT (setting_value->>'value')::INTEGER as seconds
                     FROM admin_settings WHERE setting_key = 'comment_cooldown_seconds'`
                );
                const cooldownSeconds = cooldownSetting.rows[0]?.seconds || 30;
                const lastComment = new Date(cooldownCheck.rows[0].last_comment_at);
                const secondsAgo = (Date.now() - lastComment.getTime()) / 1000;

                if (secondsAgo < cooldownSeconds) {
                    return res.status(429).json({
                        error: `Espera ${Math.ceil(cooldownSeconds - secondsAgo)} segundos antes de comentar de nuevo.`
                    });
                }
            }

            // Obtener dueño del pin
            const pinOwner = await query(
                'SELECT user_id FROM pins WHERE id = $1',
                [id]
            );

            const result = await transaction(async (client) => {
                // Crear comentario
                const commentResult = await client.query(
                    `INSERT INTO comments (user_id, pin_id, content)
                     VALUES ($1, $2, $3)
                     RETURNING *`,
                    [user_id, id, content]
                );

                // Puntos para quien comenta
                await client.query(
                    `SELECT record_point_transaction($1, 'comment_pin', $2, NULL, false, 'Comentaste en un pin')`,
                    [user_id, id]
                );

                // Puntos para quien recibe comentario (si no es el mismo usuario)
                if (pinOwner.rows[0] && pinOwner.rows[0].user_id !== user_id) {
                    await client.query(
                        `SELECT record_point_transaction($1, 'receive_comment', $2, $3, false, 'Recibiste un comentario')`,
                        [pinOwner.rows[0].user_id, id, user_id]
                    );
                }

                // Incrementar estadísticas diarias
                await client.query(
                    `SELECT increment_daily_stat($1, 'comment')`,
                    [user_id]
                );

                return commentResult.rows[0];
            });

            res.status(201).json({
                message: 'Comentario creado',
                comment: result
            });

        } catch (error) {
            console.error('Error al crear comentario:', error);
            res.status(500).json({ error: 'Error al crear comentario' });
        }
    }
);

module.exports = router;
