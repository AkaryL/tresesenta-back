const express = require('express');
const { query } = require('../config/db');

const router = express.Router();

const BASE_URL = 'https://mapa.tenis360.com';

// GET /api/og/pin/:id
// Returns HTML with Open Graph meta tags for social media previews
router.get('/pin/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(`
            SELECT p.id, p.title, p.description, p.image_urls, p.video_url,
                   p.latitude, p.longitude,
                   u.username, c.name_es as category, ci.name as city
            FROM pins p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN cities ci ON p.city_id = ci.id
            WHERE p.id = $1 AND p.is_hidden = false
        `, [id]);

        if (result.rows.length === 0) {
            return res.redirect(BASE_URL);
        }

        const pin = result.rows[0];
        const title = pin.title || 'Pin en Mapa 360';
        const description = pin.description || `${pin.category || 'Lugar'} en ${pin.city || 'México'} · Compartido por @${pin.username || 'usuario'} en TRESESENTA Mapa 360`;
        const image = pin.video_url
            ? pin.video_url.replace('/video/upload/', '/video/upload/so_0,w_800,f_jpg/').replace(/\.\w+$/, '.jpg')
            : (pin.image_urls && pin.image_urls[0]) || `${BASE_URL}/assets/TRESESENTA-oOI3F92B.png`;
        const url = `${BASE_URL}/map?lat=${pin.latitude}&lng=${pin.longitude}&zoom=17`;

        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${title} | TRESESENTA Mapa 360</title>
    <meta name="description" content="${description}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="800">
    <meta property="og:image:height" content="800">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="TRESESENTA Mapa 360">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">

    <!-- Redirect to the actual app -->
    <meta http-equiv="refresh" content="0;url=${url}">
    <script>window.location.href = "${url}";</script>
</head>
<body>
    <p>Redirigiendo a <a href="${url}">${title}</a>...</p>
</body>
</html>`);

    } catch (error) {
        console.error('OG error:', error);
        res.redirect(BASE_URL);
    }
});

module.exports = router;
