const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configurar Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage para imágenes
const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'tresesenta-mapa360',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
    }
});

// Storage para videos
const videoStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'tresesenta-mapa360/videos',
        resource_type: 'video',
        allowed_formats: ['mp4', 'mov', 'webm'],
        transformation: [{ width: 1080, crop: 'limit', quality: 'auto' }]
    }
});

// Multer para imágenes
const imageUpload = multer({
    storage: imageStorage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Solo imágenes JPG, PNG, GIF, WEBP'));
    }
});

// Multer para videos
const videoUpload = multer({
    storage: videoStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Solo videos MP4, MOV, WEBM'));
    }
});

const uploadImages = imageUpload.array('images', parseInt(process.env.MAX_FILES_PER_PIN) || 5);
const uploadVideo = videoUpload.single('video');

const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Archivo demasiado grande' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Demasiados archivos' });
        }
    }
    if (err) return res.status(400).json({ error: err.message || 'Error al subir archivo' });
    next();
};

module.exports = {
    cloudinary,
    uploadImages,
    uploadVideo,
    handleUploadError
};
