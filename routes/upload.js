const express = require('express');
const { uploadImages, uploadVideo, handleUploadError } = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/upload/images
router.post('/images', authenticateToken, (req, res) => {
    uploadImages(req, res, (err) => {
        handleUploadError(err, req, res, () => {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No se subieron imágenes' });
            }
            const imageUrls = req.files.map(file => file.path);
            res.json({ message: 'Imágenes subidas', images: imageUrls, count: imageUrls.length });
        });
    });
});

// POST /api/upload/video
router.post('/video', authenticateToken, (req, res) => {
    uploadVideo(req, res, (err) => {
        handleUploadError(err, req, res, () => {
            if (!req.file) {
                return res.status(400).json({ error: 'No se subió video' });
            }
            const videoUrl = req.file.path;
            // Generate thumbnail from first frame
            const thumbnailUrl = videoUrl.replace('/video/upload/', '/video/upload/so_0,w_480,f_jpg/');
            res.json({ message: 'Video subido', video_url: videoUrl, thumbnail_url: thumbnailUrl });
        });
    });
});

module.exports = router;
