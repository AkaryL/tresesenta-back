const express = require('express');
const { uploadImages, handleUploadError } = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ====================================
// POST /api/upload/images
// Subir imágenes
// ====================================
router.post('/images', authenticateToken, (req, res) => {
    uploadImages(req, res, (err) => {
        handleUploadError(err, req, res, () => {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    error: 'No se subieron imágenes'
                });
            }

            // Extraer URLs de las imágenes subidas
            const imageUrls = req.files.map(file => file.path);

            res.json({
                message: 'Imágenes subidas exitosamente',
                images: imageUrls,
                count: imageUrls.length
            });
        });
    });
});

module.exports = router;
