const express = require('express');
const { query } = require('../config/db');

const router = express.Router();

// ====================================
// GET /api/categories
// Obtener todas las categorías
// ====================================
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT id, name, name_es, emoji, color, description
             FROM categories
             ORDER BY id`
        );

        res.json({ categories: result.rows });

    } catch (error) {
        console.error('Error al obtener categorías:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

module.exports = router;
