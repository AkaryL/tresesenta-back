const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');

const router = express.Router();

// ====================================
// POST /api/auth/register
// Registro de nuevo usuario
// ====================================
router.post('/register',
    [
        body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username debe tener entre 3 y 50 caracteres'),
        body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
        body('password').isLength({ min: 6 }).withMessage('Password debe tener al menos 6 caracteres'),
        body('full_name').optional().trim().isLength({ max: 100 })
    ],
    async (req, res) => {
        try {
            // Validar inputs
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { username, email, password, full_name } = req.body;

            // Verificar si el usuario ya existe
            const existingUser = await query(
                'SELECT id FROM users WHERE username = $1 OR email = $2',
                [username, email]
            );

            if (existingUser.rows.length > 0) {
                return res.status(409).json({
                    error: 'Usuario o email ya registrado'
                });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            // Crear usuario
            const result = await query(
                `INSERT INTO users (username, email, password_hash, full_name)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, username, email, full_name, total_points, level, created_at`,
                [username, email, password_hash, full_name || null]
            );

            const user = result.rows[0];

            // Generar JWT
            const token = jwt.sign(
                { id: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            res.status(201).json({
                message: '¡Bienvenido a TRESESENTA MAPA360!',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    total_points: user.total_points,
                    level: user.level
                }
            });

        } catch (error) {
            console.error('Error en registro:', error);
            res.status(500).json({ error: 'Error al registrar usuario' });
        }
    }
);

// ====================================
// POST /api/auth/login
// Login de usuario
// ====================================
router.post('/login',
    [
        body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
        body('password').notEmpty().withMessage('Password requerido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            // Buscar usuario
            const result = await query(
                'SELECT id, username, email, password_hash, full_name, total_points, level, avatar_url FROM users WHERE email = $1',
                [email]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    error: 'Email o contraseña incorrectos'
                });
            }

            const user = result.rows[0];

            // Verificar password
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({
                    error: 'Email o contraseña incorrectos'
                });
            }

            // Generar JWT
            const token = jwt.sign(
                { id: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            res.json({
                message: '¡Bienvenido de nuevo!',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    total_points: user.total_points,
                    level: user.level,
                    avatar_url: user.avatar_url
                }
            });

        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ error: 'Error al iniciar sesión' });
        }
    }
);

// ====================================
// GET /api/auth/me
// Obtener usuario actual
// ====================================
router.get('/me', async (req, res) => {
    try {
        // Verificar token
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Obtener usuario
        const result = await query(
            `SELECT id, username, email, full_name, total_points, level, avatar_url, ranking_position, created_at
             FROM users WHERE id = $1`,
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ user: result.rows[0] });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado' });
        }
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
