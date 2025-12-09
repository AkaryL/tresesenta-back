const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configurar Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar storage de Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'tresesenta-mapa360',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
    }
});

// Configurar multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido. Solo imágenes JPG, PNG, GIF, WEBP'));
        }
    }
});

// Middleware para upload de múltiples imágenes
const uploadImages = upload.array('images', parseInt(process.env.MAX_FILES_PER_PIN) || 5);

// Middleware de manejo de errores
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'Archivo demasiado grande. Máximo 5MB por imagen'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: `Máximo ${process.env.MAX_FILES_PER_PIN || 5} imágenes permitidas`
            });
        }
    }
    if (err) {
        return res.status(400).json({
            error: err.message || 'Error al subir imagen'
        });
    }
    next();
};

module.exports = {
    cloudinary,
    uploadImages,
    handleUploadError
};
