const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
require('dotenv').config();

const { testConnection } = require('./config/db');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Socket.IO
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Make io accessible to routes via app.locals
app.locals.io = io;

io.on('connection', (socket) => {
    // Join a pin room to receive comment updates
    socket.on('join-pin', (pinId) => {
        socket.join(`pin-${pinId}`);
    });

    socket.on('leave-pin', (pinId) => {
        socket.leave(`pin-${pinId}`);
    });
});

// ====================================
// MIDDLEWARES
// ====================================

// Security headers
app.use(helmet());

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 500, // límite de 500 requests por IP
    message: 'Demasiadas peticiones desde esta IP, intenta de nuevo más tarde.'
});
app.use('/api/', limiter);

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ====================================
// ROUTES
// ====================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/pins', require('./routes/pins'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/badges', require('./routes/badges'));
app.use('/api/routes', require('./routes/routes'));
app.use('/api/upload', require('./routes/upload'));
// Nuevas rutas para sistema de puntos, verificación y admin
app.use('/api/points', require('./routes/points'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/admin', require('./routes/admin'));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ====================================
// START SERVER
// ====================================

const startServer = async () => {
    try {
        // Test database connection
        const dbConnected = await testConnection();
        if (!dbConnected) {
            throw new Error('No se pudo conectar a la base de datos');
        }

        // Start listening
        server.listen(PORT, () => {
            console.log('\n🚀 ================================');
            console.log(`🚀 TRESESENTA MAPA360 API`);
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🚀 Environment: ${process.env.NODE_ENV}`);
            console.log(`🚀 Health check: http://localhost:${PORT}/health`);
            console.log('🚀 ================================\n');
        });
    } catch (error) {
        console.error('❌ Error al iniciar el servidor:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing server...');
    process.exit(0);
});

startServer();

module.exports = app;
