const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/db');
const shopify = require('../services/shopify');

const router = express.Router();

// Rate limiter para OTP (3 solicitudes por 10 minutos por email)
const otpRateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const email = req.body.email ? req.body.email.toLowerCase().trim() : 'unknown';
        return `${email}_${req.ip}`;
    },
    message: {
        error: 'Demasiados intentos. Espera unos minutos.',
        code: 'RATE_LIMITED'
    }
});

// Generar código OTP de 6 dígitos
// TODO: Cambiar a código aleatorio cuando se configure el email
function generateOTP() {
    // Código fijo para desarrollo (cambiar cuando esté listo el email)
    return '123456';
    // return Math.floor(100000 + Math.random() * 900000).toString();
}

// ====================================
// POST /api/auth/request-code
// Solicitar código OTP (Shopify customers)
// ====================================
router.post('/request-code',
    otpRateLimiter,
    [body('email').isEmail().normalizeEmail().withMessage('Email inválido')],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(422).json({ error: 'Email inválido' });
            }

            const { email } = req.body;
            const normalizedEmail = email.toLowerCase().trim();

            console.log(`[AUTH] Solicitando código para: ${normalizedEmail}`);

            // Buscar en Shopify
            const customer = await shopify.findCustomerByEmail(normalizedEmail);

            if (!customer) {
                console.log(`[AUTH] Email no encontrado en Shopify: ${normalizedEmail}`);
                return res.status(404).json({
                    status: 'NOT_FOUND',
                    message: 'No encontramos una cuenta con este email en Tresesenta'
                });
            }

            // Generar OTP
            const code = generateOTP();
            const codeHash = await bcrypt.hash(code, 10);
            const ttlMinutes = parseInt(process.env.OTP_TTL_MINUTES) || 10;

            // Invalidar códigos anteriores
            await query('UPDATE otp_codes SET used = TRUE WHERE email = $1', [normalizedEmail]);

            // Guardar nuevo código (usar NOW() de PostgreSQL para evitar problemas de timezone)
            await query(
                `INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${ttlMinutes} minutes')`,
                [normalizedEmail, codeHash]
            );

            // Enviar OTP (console en desarrollo)
            await shopify.sendOTPEmail(normalizedEmail, code);

            res.json({
                status: 'OTP_SENT',
                message: 'Código enviado a tu email',
                expires_in_minutes: ttlMinutes
            });

        } catch (error) {
            console.error('[AUTH] Error en request-code:', error.message);
            res.status(500).json({ error: 'Error al procesar la solicitud' });
        }
    }
);

// ====================================
// POST /api/auth/register-and-send-code
// Registrar en Shopify y enviar OTP
// ====================================
router.post('/register-and-send-code',
    otpRateLimiter,
    [
        body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
        body('first_name').optional().trim().isLength({ max: 100 }),
        body('last_name').optional().trim().isLength({ max: 100 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(422).json({ error: 'Datos inválidos' });
            }

            const { email, first_name, last_name } = req.body;
            const normalizedEmail = email.toLowerCase().trim();

            console.log(`[AUTH] Registro + OTP para: ${normalizedEmail}`);

            // Verificar si ya existe en Shopify
            let customer = await shopify.findCustomerByEmail(normalizedEmail);
            let isNewAccount = false;

            if (!customer) {
                // Crear en Shopify
                console.log(`[AUTH] Creando nuevo cliente en Shopify`);
                customer = await shopify.createCustomer({
                    email: normalizedEmail,
                    first_name: first_name || '',
                    last_name: last_name || ''
                });
                isNewAccount = true;
            }

            // Generar OTP
            const code = generateOTP();
            const codeHash = await bcrypt.hash(code, 10);
            const ttlMinutes = parseInt(process.env.OTP_TTL_MINUTES) || 10;

            await query('UPDATE otp_codes SET used = TRUE WHERE email = $1', [normalizedEmail]);
            await query(
                `INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${ttlMinutes} minutes')`,
                [normalizedEmail, codeHash]
            );

            await shopify.sendOTPEmail(normalizedEmail, code);

            res.json({
                status: 'REGISTERED_OTP_SENT',
                message: isNewAccount ? 'Cuenta creada. Código enviado.' : 'Código enviado.',
                is_new_account: isNewAccount,
                expires_in_minutes: ttlMinutes
            });

        } catch (error) {
            console.error('[AUTH] Error en register-and-send-code:', error.message);
            res.status(500).json({ error: 'Error al procesar el registro' });
        }
    }
);

// ====================================
// POST /api/auth/verify-code
// Verificar OTP y crear sesión
// ====================================
router.post('/verify-code',
    [
        body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
        body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Código inválido')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(422).json({ error: 'Datos inválidos' });
            }

            const { email, code } = req.body;
            const normalizedEmail = email.toLowerCase().trim();

            console.log(`[AUTH] Verificando código para: ${normalizedEmail}`);

            // Buscar OTP válido
            const otpResult = await query(
                `SELECT * FROM otp_codes
                 WHERE email = $1 AND expires_at > NOW() AND used = FALSE
                 ORDER BY created_at DESC LIMIT 1`,
                [normalizedEmail]
            );

            if (otpResult.rows.length === 0) {
                return res.status(400).json({
                    error: 'Código expirado o no encontrado. Solicita uno nuevo.',
                    code: 'OTP_EXPIRED'
                });
            }

            const otpRecord = otpResult.rows[0];
            const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS) || 5;

            // Verificar intentos
            if (otpRecord.attempts >= maxAttempts) {
                await query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [otpRecord.id]);
                return res.status(429).json({
                    error: 'Demasiados intentos. Solicita un nuevo código.',
                    code: 'MAX_ATTEMPTS'
                });
            }

            // Verificar código
            const isValid = await bcrypt.compare(code, otpRecord.code_hash);

            if (!isValid) {
                await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otpRecord.id]);
                const remaining = maxAttempts - otpRecord.attempts - 1;
                return res.status(400).json({
                    error: `Código incorrecto. Te quedan ${remaining} intentos.`,
                    code: 'INVALID_CODE',
                    attempts_remaining: remaining
                });
            }

            // Marcar OTP como usado
            await query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [otpRecord.id]);

            // Obtener info de Shopify
            const customer = await shopify.findCustomerByEmail(normalizedEmail);
            if (!customer) {
                return res.status(400).json({ error: 'Cliente no encontrado en Shopify' });
            }

            // Buscar o crear usuario local
            let userResult = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
            let user;

            if (userResult.rows.length === 0) {
                // Crear usuario nuevo
                const username = normalizedEmail.split('@')[0] + '_' + Date.now().toString().slice(-4);
                const insertResult = await query(
                    `INSERT INTO users (username, email, password_hash, full_name, shopify_customer_id)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id, username, email, full_name, total_points, level, shopify_customer_id`,
                    [username, normalizedEmail, '', `${customer.first_name} ${customer.last_name}`.trim(), customer.id.toString()]
                );
                user = insertResult.rows[0];
            } else {
                user = userResult.rows[0];
                // Actualizar shopify_customer_id si no lo tiene
                if (!user.shopify_customer_id) {
                    await query(
                        'UPDATE users SET shopify_customer_id = $1 WHERE id = $2',
                        [customer.id.toString(), user.id]
                    );
                    user.shopify_customer_id = customer.id.toString();
                }
            }

            // Generar JWT
            const token = jwt.sign(
                { id: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            console.log(`[AUTH] Login exitoso: ${normalizedEmail}`);

            res.json({
                status: 'SUCCESS',
                message: '¡Bienvenido!',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: normalizedEmail,
                    full_name: user.full_name || `${customer.first_name} ${customer.last_name}`.trim(),
                    total_points: user.total_points || 0,
                    level: user.level || 1,
                    shopify_customer_id: user.shopify_customer_id
                }
            });

        } catch (error) {
            console.error('[AUTH] Error en verify-code:', error.message);
            res.status(500).json({ error: 'Error al verificar el código' });
        }
    }
);

// ====================================
// GET /api/auth/me
// Obtener usuario actual
// ====================================
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await query(
            `SELECT id, username, email, full_name, total_points, level, avatar_url, ranking_position, shopify_customer_id, created_at
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

// ====================================
// GET /api/auth/my-orders
// Obtener órdenes de Shopify del usuario
// ====================================
router.get('/my-orders', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userResult = await query(
            'SELECT shopify_customer_id FROM users WHERE id = $1',
            [decoded.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const { shopify_customer_id } = userResult.rows[0];

        if (!shopify_customer_id) {
            return res.json({ orders: [], message: 'No tienes cuenta vinculada a Tresesenta' });
        }

        const orders = await shopify.getCustomerOrders(shopify_customer_id);

        res.json({
            customer_id: shopify_customer_id,
            total_orders: orders.length,
            orders
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        console.error('[AUTH] Error obteniendo órdenes:', error.message);
        res.status(500).json({ error: 'Error al obtener órdenes' });
    }
});

// ====================================
// POST /api/auth/register (legacy - mantener por compatibilidad)
// ====================================
router.post('/register',
    [
        body('username').trim().isLength({ min: 3, max: 50 }),
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 6 }),
        body('full_name').optional().trim().isLength({ max: 100 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { username, email, password, full_name } = req.body;

            const existingUser = await query(
                'SELECT id FROM users WHERE username = $1 OR email = $2',
                [username, email]
            );

            if (existingUser.rows.length > 0) {
                return res.status(409).json({ error: 'Usuario o email ya registrado' });
            }

            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const result = await query(
                `INSERT INTO users (username, email, password_hash, full_name)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, username, email, full_name, total_points, level, created_at`,
                [username, email, password_hash, full_name || null]
            );

            const user = result.rows[0];

            const token = jwt.sign(
                { id: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            res.status(201).json({
                message: '¡Bienvenido a TRESESENTA!',
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
// POST /api/auth/login (legacy - mantener por compatibilidad)
// ====================================
router.post('/login',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            const result = await query(
                'SELECT id, username, email, password_hash, full_name, total_points, level, avatar_url, shopify_customer_id FROM users WHERE email = $1',
                [email]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Email o contraseña incorrectos' });
            }

            const user = result.rows[0];

            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Email o contraseña incorrectos' });
            }

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
                    avatar_url: user.avatar_url,
                    shopify_customer_id: user.shopify_customer_id
                }
            });

        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ error: 'Error al iniciar sesión' });
        }
    }
);

module.exports = router;
