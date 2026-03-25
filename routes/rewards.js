const express = require('express');
const { query, transaction } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Shopify config
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const API_VERSION = process.env.SHOPIFY_API_VERSION;
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_BASE_URL = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}`;

// Middleware para verificar admin
const requireAdmin = async (req, res, next) => {
    try {
        const result = await query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.user.id]
        );
        if (!result.rows[0]?.is_admin) {
            return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
        }
        next();
    } catch (error) {
        console.error('Error al verificar admin:', error);
        res.status(500).json({ error: 'Error de autenticación' });
    }
};

// ====================================
// GET /api/rewards
// Listar recompensas activas (público)
// ====================================
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT id, title, description, type, discount_value, coin_cost,
                    expiry_days, image_url
             FROM rewards
             WHERE is_active = true
             ORDER BY coin_cost ASC`
        );
        res.json({ rewards: result.rows });
    } catch (error) {
        console.error('Error al obtener recompensas:', error);
        res.status(500).json({ error: 'Error al obtener recompensas' });
    }
});

// ====================================
// GET /api/rewards/my-redemptions
// Obtener canjes del usuario actual
// (MUST be before /:id to avoid matching "my-redemptions" as :id)
// ====================================
router.get('/my-redemptions', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.id;
        const result = await query(
            `SELECT rr.id, rr.discount_code, rr.coins_spent, rr.shopify_price_rule_id,
                    rr.status, rr.redeemed_at, rr.expires_at,
                    r.title as reward_title, r.description as reward_description,
                    r.type, r.discount_value, r.image_url
             FROM reward_redemptions rr
             JOIN rewards r ON rr.reward_id = r.id
             WHERE rr.user_id = $1
             ORDER BY rr.redeemed_at DESC`,
            [user_id]
        );
        const coinsResult = await query('SELECT coins FROM users WHERE id = $1', [user_id]);
        res.json({ redemptions: result.rows, coins: coinsResult.rows[0]?.coins || 0 });
    } catch (error) {
        console.error('Error al obtener canjes:', error);
        res.status(500).json({ error: 'Error al obtener canjes' });
    }
});

// ====================================
// POST /api/rewards/:id/redeem
// Canjear una recompensa
// ====================================
router.post('/:id/redeem', authenticateToken, async (req, res) => {
    try {
        const reward_id = req.params.id;
        const user_id = req.user.id;

        // Obtener recompensa
        const rewardResult = await query(
            'SELECT * FROM rewards WHERE id = $1 AND is_active = true',
            [reward_id]
        );
        if (rewardResult.rows.length === 0) {
            return res.status(404).json({ error: 'Recompensa no encontrada o inactiva' });
        }
        const reward = rewardResult.rows[0];

        // Obtener usuario
        const userResult = await query(
            'SELECT id, username, coins FROM users WHERE id = $1',
            [user_id]
        );
        const user = userResult.rows[0];

        // Verificar monedas suficientes
        if ((user.coins || 0) < reward.coin_cost) {
            return res.status(400).json({
                error: 'No tienes suficientes monedas',
                coins_needed: reward.coin_cost,
                coins_available: user.coins || 0
            });
        }

        // Verificar límite de canjes por usuario
        if (reward.max_redemptions_per_user) {
            const redemptionCount = await query(
                'SELECT COUNT(*) as count FROM reward_redemptions WHERE user_id = $1 AND reward_id = $2',
                [user_id, reward_id]
            );
            if (parseInt(redemptionCount.rows[0].count) >= reward.max_redemptions_per_user) {
                return res.status(400).json({
                    error: 'Has alcanzado el límite de canjes para esta recompensa'
                });
            }
        }

        // Generar código de descuento único
        const random4 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const discountCode = `TRESE-${user.username.toUpperCase()}-${random4}`;

        // Calcular fecha de expiración
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (reward.expiry_days || 30));

        // Intentar crear Price Rule en Shopify
        let priceRuleId = null;
        let shopifyDiscountId = null;
        try {
            const priceRuleRes = await fetch(`${SHOPIFY_BASE_URL}/price_rules.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price_rule: {
                        title: discountCode,
                        target_type: reward.type === 'free_shipping' ? 'shipping_line' : 'line_item',
                        target_selection: 'all',
                        allocation_method: 'across',
                        value_type: reward.type === 'percentage' ? 'percentage' : 'fixed_amount',
                        value: reward.type === 'free_shipping' ? '-100.0' : `-${reward.discount_value}`,
                        customer_selection: 'all',
                        usage_limit: 1,
                        starts_at: new Date().toISOString(),
                        ends_at: expiryDate.toISOString(),
                    }
                })
            });

            if (priceRuleRes.ok) {
                const priceRuleData = await priceRuleRes.json();
                priceRuleId = priceRuleData.price_rule.id;

        // Crear Discount Code para ese Price Rule
                // Crear discount code
                const discountRes = await fetch(`${SHOPIFY_BASE_URL}/price_rules/${priceRuleId}/discount_codes.json`, {
                    method: 'POST',
                    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ discount_code: { code: discountCode } })
                });
                if (discountRes.ok) {
                    const discountData = await discountRes.json();
                    shopifyDiscountId = discountData.discount_code?.id;
                }
            } else {
                console.warn('[SHOPIFY] No se pudo crear price rule, guardando código sin Shopify');
            }
        } catch (shopifyErr) {
            console.warn('[SHOPIFY] Error (continuando sin Shopify):', shopifyErr.message);
        }

        // Deducir monedas e insertar canje en la base de datos
        const redemption = await transaction(async (client) => {
            await client.query(
                'UPDATE users SET coins = coins - $1 WHERE id = $2',
                [reward.coin_cost, user_id]
            );

            const insertResult = await client.query(
                `INSERT INTO reward_redemptions
                    (user_id, reward_id, discount_code, coins_spent, shopify_price_rule_id, shopify_discount_id, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [user_id, reward_id, discountCode, reward.coin_cost, priceRuleId, shopifyDiscountId, expiryDate]
            );

            return insertResult.rows[0];
        });

        // Get remaining coins
        const coinsResult = await query('SELECT coins FROM users WHERE id = $1', [user_id]);

        res.status(201).json({
            message: '¡Recompensa canjeada exitosamente!',
            discount_code: discountCode,
            expires_at: expiryDate.toISOString(),
            coins_spent: reward.coin_cost,
            coins_remaining: coinsResult.rows[0]?.coins || 0,
            shopify_synced: !!priceRuleId,
            redemption
        });

    } catch (error) {
        console.error('Error al canjear recompensa:', error);
        res.status(500).json({ error: 'Error al canjear recompensa' });
    }
});

// ====================================
// ADMIN ROUTES
// ====================================

// GET /api/rewards/admin/all - Listar TODAS las recompensas
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM rewards ORDER BY created_at DESC`
        );
        res.json({ rewards: result.rows });
    } catch (error) {
        console.error('Error al obtener recompensas (admin):', error);
        res.status(500).json({ error: 'Error al obtener recompensas' });
    }
});

// POST /api/rewards/admin - Crear recompensa
router.post('/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, description, type, discount_value, coin_cost, expiry_days, max_redemptions_per_user, image_url } = req.body;

        if (!title || !type || !coin_cost) {
            return res.status(400).json({ error: 'Faltan campos requeridos: title, type, coin_cost' });
        }

        const result = await query(
            `INSERT INTO rewards (title, description, type, discount_value, coin_cost, expiry_days, max_redemptions_per_user, image_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [title, description || null, type, discount_value || 0, coin_cost, expiry_days || 30, max_redemptions_per_user || null, image_url || null]
        );

        res.status(201).json({ message: 'Recompensa creada', reward: result.rows[0] });
    } catch (error) {
        console.error('Error al crear recompensa:', error);
        res.status(500).json({ error: 'Error al crear recompensa' });
    }
});

// PUT /api/rewards/admin/:id - Actualizar recompensa
router.put('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, type, discount_value, coin_cost, expiry_days, max_redemptions_per_user, image_url, is_active } = req.body;

        const result = await query(
            `UPDATE rewards SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                type = COALESCE($3, type),
                discount_value = COALESCE($4, discount_value),
                coin_cost = COALESCE($5, coin_cost),
                expiry_days = COALESCE($6, expiry_days),
                max_redemptions_per_user = COALESCE($7, max_redemptions_per_user),
                image_url = COALESCE($8, image_url),
                is_active = COALESCE($9, is_active),
                updated_at = NOW()
             WHERE id = $10
             RETURNING *`,
            [title, description, type, discount_value, coin_cost, expiry_days, max_redemptions_per_user, image_url, is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recompensa no encontrada' });
        }

        res.json({ message: 'Recompensa actualizada', reward: result.rows[0] });
    } catch (error) {
        console.error('Error al actualizar recompensa:', error);
        res.status(500).json({ error: 'Error al actualizar recompensa' });
    }
});

// DELETE /api/rewards/admin/:id - Soft delete
router.delete('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `UPDATE rewards SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, title`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recompensa no encontrada' });
        }

        res.json({ message: 'Recompensa desactivada', reward: result.rows[0] });
    } catch (error) {
        console.error('Error al desactivar recompensa:', error);
        res.status(500).json({ error: 'Error al desactivar recompensa' });
    }
});

module.exports = router;
