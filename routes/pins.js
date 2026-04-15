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
                p.is_featured, p.created_at, p.category_id,
                p.used_tresesenta, p.verification_status, p.google_place_id,
                u.id as user_id, u.username, u.avatar_url, u.is_verified_buyer,
                c.name as category_name, c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color, c.icon_url as category_icon_url,
                ci.name as city_name
            FROM pins p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE p.is_hidden = false
              AND (p.verification_status = 'approved' OR p.verification_status = 'none')
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
                    user_has_liked: likedPinIds.has(pin.id)
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
// GET /api/pins/mine
// Obtener pines del usuario actual
// ====================================
router.get('/mine', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;
        const result = await query(`
            SELECT
                p.id, p.title, p.description, p.location_name,
                p.latitude, p.longitude, p.image_urls, p.video_url,
                p.likes_count, p.comments_count,
                p.created_at, p.verification_status, p.google_place_id,
                c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color,
                ci.name as city_name
            FROM pins p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE p.user_id = $1 AND p.is_hidden = false
            ORDER BY p.created_at DESC
        `, [user_id]);

        res.json({ pins: result.rows });
    } catch (error) {
        console.error('Error al obtener mis pines:', error);
        res.status(500).json({ error: 'Error al obtener pines' });
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
                c.name as category_name, c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color, c.icon_url as category_icon_url,
                ci.name as city_name, ci.region as city_region
            FROM pins p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE p.id = $1
              AND p.is_hidden = false
              AND (p.verification_status = 'approved' OR p.verification_status = 'none')`,
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
            pin.user_has_liked = likeCheck.rows.length > 0;

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
        body('description').optional().trim(),
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
                used_tresesenta = false,
                state_name,
                google_place_id
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
            let tresesenta_bonus = used_tresesenta ? (action?.tresesenta_bonus || 0) : 0;

            // Puntos totales a otorgar al aprobar
            let points_on_approval = base_points + tresesenta_bonus;

            // Todos los pines pasan por revisión (pending por defecto)
            let verification_status = 'pending';
            let points_awarded_now = 0;

            // Excepción: compradores verificados con tresesenta se auto-aprueban
            if (used_tresesenta) {
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
                    points_awarded_now = points_on_approval;
                }
            }

            // Usar transacción para crear el pin
            const result = await transaction(async (client) => {
                // Crear pin
                const pinResult = await client.query(
                    `INSERT INTO pins
                    (user_id, category_id, title, description, location_name, latitude, longitude,
                     city_id, shoe_model, image_urls, video_url, points_awarded,
                     used_tresesenta, verification_status, state_name, google_place_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    RETURNING *`,
                    [user_id, category_id, title, description || null, location_name || null,
                        latitude, longitude, city_id || null, shoe_model || null,
                        image_urls || [], video_url || null, points_awarded_now,
                        used_tresesenta, verification_status, state_name || null, google_place_id || null]
                );

                const pin = pinResult.rows[0];

                // Solo registrar puntos si fue auto-aprobado
                if (verification_status === 'approved') {
                    const ptResult = await client.query(
                        `SELECT record_point_transaction($1, $2, $3, NULL, $4, $5) as points`,
                        [user_id, action_code, pin.id, true, `Pin creado: ${title}`]
                    );
                    const ptPoints = ptResult.rows[0]?.points || 0;
                    if (ptPoints > 0) {
                        await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [ptPoints, user_id]);
                    }
                }

                // Incrementar estadísticas diarias siempre
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
                        [user_id, city_id, points_awarded_now]
                    );
                }

                // Crear solicitud de verificación para todos los pines pendientes
                if (verification_status === 'pending') {
                    await client.query(
                        `INSERT INTO verification_requests (pin_id, user_id, bonus_points)
                         VALUES ($1, $2, $3)`,
                        [pin.id, user_id, points_on_approval]
                    );
                }

                return pin;
            });

            let message;
            if (verification_status === 'approved') {
                message = `¡Pin creado! Has ganado ${points_awarded_now} puntos (auto-aprobado)`;
            } else {
                message = 'Tu pin fue enviado para revisión. Ganarás puntos cuando un administrador lo apruebe.';
                if (used_tresesenta) {
                    message += ` (+${points_on_approval} pts incluyen bonus TRESESENTA)`;
                }
            }

            res.status(201).json({
                message,
                pin: result,
                points_earned: points_awarded_now,
                verification_status
            });

        } catch (error) {
            console.error('Error al crear pin:', error);
            res.status(500).json({ error: 'Error al crear pin' });
        }
    }
);

// ====================================
// PUT /api/pins/:id
// Editar un pin propio (título, descripción, categoría)
// ====================================
router.put('/:id',
    authenticateToken,
    [
        body('title').optional().trim().notEmpty().withMessage('Título no puede estar vacío'),
        body('description').optional().trim(),
        body('category_id').optional().isInt().withMessage('Categoría inválida')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const user_id = req.user.id;

            // Verificar que el pin existe y pertenece al usuario
            const pinCheck = await query(
                'SELECT user_id FROM pins WHERE id = $1',
                [id]
            );

            if (pinCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Pin no encontrado' });
            }

            if (pinCheck.rows[0].user_id !== user_id) {
                return res.status(403).json({ error: 'No tienes permiso para editar este pin' });
            }

            const { title, description, category_id } = req.body;

            // Construir query dinámico solo con campos enviados
            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (title !== undefined) {
                updates.push(`title = $${paramIndex}`);
                values.push(title);
                paramIndex++;
            }
            if (description !== undefined) {
                updates.push(`description = $${paramIndex}`);
                values.push(description);
                paramIndex++;
            }
            if (category_id !== undefined) {
                updates.push(`category_id = $${paramIndex}`);
                values.push(category_id);
                paramIndex++;
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
            }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id);

            const result = await query(
                `UPDATE pins SET ${updates.join(', ')} WHERE id = $${paramIndex}
                 RETURNING *`,
                values
            );

            // Obtener pin completo con joins para retornar
            const fullPin = await query(
                `SELECT
                    p.*,
                    u.id as user_id, u.username, u.avatar_url,
                    c.name as category_name, c.name_es as category_name_es, c.emoji as category_emoji, c.color as category_color, c.icon_url as category_icon_url,
                    ci.name as city_name
                FROM pins p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN cities ci ON p.city_id = ci.id
                WHERE p.id = $1`,
                [id]
            );

            const updatedPin = fullPin.rows[0];

            // WebSocket: notificar a todos que el pin se actualizó
            const io = req.app.locals.io;
            if (io) {
                io.emit('pin:updated', updatedPin);
            }

            res.json({ message: 'Pin actualizado', pin: updatedPin });

        } catch (error) {
            console.error('Error al editar pin:', error);
            res.status(500).json({ error: 'Error al editar pin' });
        }
    }
);

// ====================================
// DELETE /api/pins/:id
// Eliminar un pin propio
// ====================================
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        // Verificar que el pin existe y pertenece al usuario
        const pinCheck = await query(
            'SELECT user_id FROM pins WHERE id = $1',
            [id]
        );

        if (pinCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Pin no encontrado' });
        }

        if (pinCheck.rows[0].user_id !== user_id) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar este pin' });
        }

        // Eliminar pin (cascade borra likes, comments, verification_requests)
        await query('DELETE FROM pins WHERE id = $1', [id]);

        // WebSocket: notificar que el pin fue removido
        const io = req.app.locals.io;
        if (io) {
            io.emit('pin:removed', { pin_id: parseInt(id) });
        }

        res.json({ message: 'Pin eliminado' });

    } catch (error) {
        console.error('Error al eliminar pin:', error);
        res.status(500).json({ error: 'Error al eliminar pin' });
    }
});

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

            // Incrementar likes_count en el pin
            await client.query(
                'UPDATE pins SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1',
                [id]
            );

            // Puntos para quien da like
            const likeResult = await client.query(
                `SELECT record_point_transaction($1, 'like_pin', $2, NULL, false, 'Diste like') as points`,
                [user_id, id]
            );
            const likePoints = likeResult.rows[0]?.points || 0;
            if (likePoints > 0) {
                await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [likePoints, user_id]);
            }

            // Puntos para quien recibe like (si no es el mismo usuario)
            if (pinOwner.rows[0] && pinOwner.rows[0].user_id !== user_id) {
                const recvLikeResult = await client.query(
                    `SELECT record_point_transaction($1, 'receive_like', $2, $3, false, 'Recibiste un like') as points`,
                    [pinOwner.rows[0].user_id, id, user_id]
                );
                const recvLikePoints = recvLikeResult.rows[0]?.points || 0;
                if (recvLikePoints > 0) {
                    await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [recvLikePoints, pinOwner.rows[0].user_id]);
                }
            }

            // Incrementar estadísticas diarias
            await client.query(
                `SELECT increment_daily_stat($1, 'like')`,
                [user_id]
            );
        });

        // Emit via WebSocket
        const io = req.app.locals.io;
        if (io) {
            io.to(`pin-${id}`).emit('pin-liked', {
                pin_id: parseInt(id),
                user_id,
                liked: true,
            });
        }

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

        // Decrementar likes_count en el pin
        await query(
            'UPDATE pins SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = $1',
            [id]
        );

        // Emit via WebSocket
        const io = req.app.locals.io;
        if (io) {
            io.to(`pin-${id}`).emit('pin-liked', {
                pin_id: parseInt(id),
                user_id,
                liked: false,
            });
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
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.pin_id = $1
             ORDER BY c.created_at ASC`,
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
                const commentPtsResult = await client.query(
                    `SELECT record_point_transaction($1, 'comment_pin', $2, NULL, false, 'Comentaste en un pin') as points`,
                    [user_id, id]
                );
                const commentPoints = commentPtsResult.rows[0]?.points || 0;
                if (commentPoints > 0) {
                    await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [commentPoints, user_id]);
                }

                // Puntos para quien recibe comentario (si no es el mismo usuario)
                if (pinOwner.rows[0] && pinOwner.rows[0].user_id !== user_id) {
                    const recvCommentResult = await client.query(
                        `SELECT record_point_transaction($1, 'receive_comment', $2, $3, false, 'Recibiste un comentario') as points`,
                        [pinOwner.rows[0].user_id, id, user_id]
                    );
                    const recvCommentPoints = recvCommentResult.rows[0]?.points || 0;
                    if (recvCommentPoints > 0) {
                        await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [recvCommentPoints, pinOwner.rows[0].user_id]);
                    }
                }

                // Incrementar estadísticas diarias
                await client.query(
                    `SELECT increment_daily_stat($1, 'comment')`,
                    [user_id]
                );

                return commentResult.rows[0];
            });

            // Emit via WebSocket to pin room
            const io = req.app.locals.io;
            if (io) {
                io.to(`pin-${id}`).emit('new-comment', {
                    pin_id: parseInt(id),
                    comment: {
                        ...result,
                        username: req.user.username,
                        user: { username: req.user.username },
                    },
                });
            }

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
