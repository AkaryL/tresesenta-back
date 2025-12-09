const express = require('express');
const { query } = require('../config/db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ====================================
// GET /api/cities
// Obtener todas las ciudades
// ====================================
router.get('/', optionalAuth, async (req, res) => {
    try {
        const result = await query(
            `SELECT c.*, COUNT(p.id) as pins_count
             FROM cities c
             LEFT JOIN pins p ON c.id = p.city_id
             GROUP BY c.id
             ORDER BY c.region, c.name`
        );

        // Si hay usuario logueado, agregar info de ciudades visitadas
        if (req.user) {
            const visitedResult = await query(
                `SELECT city_id, pins_count, points_earned
                 FROM user_cities
                 WHERE user_id = $1`,
                [req.user.id]
            );

            const visitedMap = new Map(
                visitedResult.rows.map(v => [v.city_id, { pins_count: v.pins_count, points_earned: v.points_earned }])
            );

            res.json({
                cities: result.rows.map(city => ({
                    ...city,
                    visited: visitedMap.has(city.id),
                    user_pins_count: visitedMap.get(city.id)?.pins_count || 0,
                    user_points_earned: visitedMap.get(city.id)?.points_earned || 0
                }))
            });
        } else {
            res.json({ cities: result.rows });
        }

    } catch (error) {
        console.error('Error al obtener ciudades:', error);
        res.status(500).json({ error: 'Error al obtener ciudades' });
    }
});

// ====================================
// GET /api/cities/:id
// Obtener información de una ciudad específica
// ====================================
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const cityResult = await query(
            `SELECT c.*, COUNT(p.id) as total_pins
             FROM cities c
             LEFT JOIN pins p ON c.id = p.city_id
             WHERE c.id = $1
             GROUP BY c.id`,
            [id]
        );

        if (cityResult.rows.length === 0) {
            return res.status(404).json({ error: 'Ciudad no encontrada' });
        }

        const city = cityResult.rows[0];

        // Obtener pins destacados de la ciudad
        const pinsResult = await query(
            `SELECT p.id, p.title, p.image_urls, p.likes_count, u.username
             FROM pins p
             JOIN users u ON p.user_id = u.id
             WHERE p.city_id = $1
             ORDER BY p.likes_count DESC
             LIMIT 5`,
            [id]
        );

        city.featured_pins = pinsResult.rows;

        // Si hay usuario, agregar info de visita
        if (req.user) {
            const userCityResult = await query(
                `SELECT pins_count, points_earned, first_visit, last_visit
                 FROM user_cities
                 WHERE user_id = $1 AND city_id = $2`,
                [req.user.id, id]
            );

            if (userCityResult.rows.length > 0) {
                city.user_data = userCityResult.rows[0];
                city.visited = true;
            } else {
                city.visited = false;
            }
        }

        res.json({ city });

    } catch (error) {
        console.error('Error al obtener ciudad:', error);
        res.status(500).json({ error: 'Error al obtener ciudad' });
    }
});

module.exports = router;
