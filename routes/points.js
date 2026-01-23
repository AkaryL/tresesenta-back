const express = require('express');
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/points/actions
// Obtener todas las acciones de puntos configuradas
// ====================================
router.get('/actions', async (req, res) => {
    try {
        const result = await query(
            `SELECT action_code, action_name_es as name, description, points,
                    daily_limit, tresesenta_bonus, category
             FROM point_actions
             WHERE is_active = true
             ORDER BY category, points DESC`
        );

        res.json({ actions: result.rows });

    } catch (error) {
        console.error('Error al obtener acciones de puntos:', error);
        res.status(500).json({ error: 'Error al obtener acciones de puntos' });
    }
});

// ====================================
// GET /api/points/my-transactions
// Obtener historial de puntos del usuario actual
// ====================================
router.get('/my-transactions', authenticateToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const user_id = req.user.id;

        const result = await query(
            `SELECT pt.id, pt.points, pt.balance_after, pt.description,
                    pt.used_tresesenta_bonus, pt.created_at,
                    pa.action_name_es as action_name, pa.category
             FROM point_transactions pt
             LEFT JOIN point_actions pa ON pt.action_id = pa.id
             WHERE pt.user_id = $1
             ORDER BY pt.created_at DESC
             LIMIT $2 OFFSET $3`,
            [user_id, parseInt(limit), parseInt(offset)]
        );

        // Obtener total de puntos
        const totalResult = await query(
            `SELECT total_points FROM users WHERE id = $1`,
            [user_id]
        );

        res.json({
            transactions: result.rows,
            total_points: totalResult.rows[0]?.total_points || 0
        });

    } catch (error) {
        console.error('Error al obtener transacciones:', error);
        res.status(500).json({ error: 'Error al obtener transacciones' });
    }
});

// ====================================
// GET /api/points/my-stats
// Obtener estadísticas diarias del usuario
// ====================================
router.get('/my-stats', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        // Stats de hoy
        const todayStats = await query(
            `SELECT * FROM user_daily_stats
             WHERE user_id = $1 AND stat_date = CURRENT_DATE`,
            [user_id]
        );

        // Límites configurados
        const limits = await query(
            `SELECT setting_key, setting_value->>'value' as value
             FROM admin_settings
             WHERE category = 'limits'`
        );

        const limitsMap = {};
        limits.rows.forEach(l => {
            limitsMap[l.setting_key] = parseInt(l.value);
        });

        const stats = todayStats.rows[0] || {
            pins_created: 0,
            photos_uploaded: 0,
            comments_made: 0,
            likes_given: 0,
            shares_made: 0,
            points_earned: 0,
            login_streak: 0
        };

        res.json({
            today: {
                pins: { used: stats.pins_created, limit: limitsMap.daily_photo_limit || 5 },
                comments: { used: stats.comments_made, limit: limitsMap.daily_comment_limit || 20 },
                likes: { used: stats.likes_given, limit: limitsMap.daily_like_limit || 50 },
                points_earned: stats.points_earned
            },
            streak: stats.login_streak
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// ====================================
// GET /api/points/leaderboard
// Obtener tabla de clasificación
// ====================================
router.get('/leaderboard', async (req, res) => {
    try {
        const { limit = 20, period = 'all' } = req.query;

        let queryText;
        let params = [parseInt(limit)];

        if (period === 'week') {
            // Leaderboard de la semana
            queryText = `
                SELECT u.id, u.username, u.avatar_url, u.level, u.profile_color,
                       COALESCE(SUM(pt.points), 0) as period_points,
                       u.total_points
                FROM users u
                LEFT JOIN point_transactions pt ON u.id = pt.user_id
                    AND pt.created_at >= CURRENT_DATE - INTERVAL '7 days'
                WHERE u.is_banned = false
                GROUP BY u.id
                ORDER BY period_points DESC
                LIMIT $1
            `;
        } else if (period === 'month') {
            // Leaderboard del mes
            queryText = `
                SELECT u.id, u.username, u.avatar_url, u.level, u.profile_color,
                       COALESCE(SUM(pt.points), 0) as period_points,
                       u.total_points
                FROM users u
                LEFT JOIN point_transactions pt ON u.id = pt.user_id
                    AND pt.created_at >= CURRENT_DATE - INTERVAL '30 days'
                WHERE u.is_banned = false
                GROUP BY u.id
                ORDER BY period_points DESC
                LIMIT $1
            `;
        } else {
            // Leaderboard total
            queryText = `
                SELECT id, username, avatar_url, level, profile_color,
                       total_points, total_points as period_points
                FROM users
                WHERE is_banned = false
                ORDER BY total_points DESC
                LIMIT $1
            `;
        }

        const result = await query(queryText, params);

        // Agregar posición
        const leaderboard = result.rows.map((user, index) => ({
            ...user,
            position: index + 1
        }));

        res.json({ leaderboard, period });

    } catch (error) {
        console.error('Error al obtener leaderboard:', error);
        res.status(500).json({ error: 'Error al obtener leaderboard' });
    }
});

// ====================================
// POST /api/points/daily-login
// Registrar login diario y dar puntos
// ====================================
router.post('/daily-login', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        // Verificar si ya reclamó hoy
        const todayCheck = await query(
            `SELECT * FROM user_daily_stats
             WHERE user_id = $1 AND stat_date = CURRENT_DATE`,
            [user_id]
        );

        if (todayCheck.rows.length > 0 && todayCheck.rows[0].last_login_date === new Date().toISOString().split('T')[0]) {
            return res.json({
                message: 'Ya reclamaste tu bonus de hoy',
                already_claimed: true,
                streak: todayCheck.rows[0].login_streak
            });
        }

        // Calcular streak
        const yesterdayCheck = await query(
            `SELECT login_streak FROM user_daily_stats
             WHERE user_id = $1 AND stat_date = CURRENT_DATE - INTERVAL '1 day'`,
            [user_id]
        );

        let newStreak = 1;
        if (yesterdayCheck.rows.length > 0) {
            newStreak = yesterdayCheck.rows[0].login_streak + 1;
        }

        // Crear o actualizar stats de hoy
        await query(
            `INSERT INTO user_daily_stats (user_id, stat_date, login_streak, last_login_date)
             VALUES ($1, CURRENT_DATE, $2, CURRENT_DATE)
             ON CONFLICT (user_id, stat_date)
             DO UPDATE SET login_streak = $2, last_login_date = CURRENT_DATE`,
            [user_id, newStreak]
        );

        // Dar puntos de login diario
        await query(
            `SELECT record_point_transaction($1, 'daily_login', NULL, NULL, false, 'Login diario')`,
            [user_id]
        );

        // Verificar si hay bonus de racha
        let streakBonus = null;
        if (newStreak === 7) {
            await query(
                `SELECT record_point_transaction($1, 'streak_7_days', NULL, NULL, false, 'Racha de 7 días')`,
                [user_id]
            );
            streakBonus = { days: 7, message: '¡7 días seguidos!' };
        } else if (newStreak === 30) {
            await query(
                `SELECT record_point_transaction($1, 'streak_30_days', NULL, NULL, false, 'Racha de 30 días')`,
                [user_id]
            );
            streakBonus = { days: 30, message: '¡30 días seguidos!' };
        }

        res.json({
            message: '¡Login diario registrado!',
            streak: newStreak,
            streak_bonus: streakBonus
        });

    } catch (error) {
        console.error('Error al registrar login diario:', error);
        res.status(500).json({ error: 'Error al registrar login diario' });
    }
});

module.exports = router;
