const { Pool } = require('pg');
require('dotenv').config();

// Configuración de conexión a PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false // Necesario para DigitalOcean
    } : false,
    // Configuración de pool
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Event listeners para debugging
pool.on('connect', () => {
    console.log('✅ Nueva conexión establecida con PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Error inesperado en cliente idle:', err);
    process.exit(-1);
});

// Función helper para queries
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

// Función para transacciones
const transaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Test de conexión
const testConnection = async () => {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('🎉 Conexión exitosa a PostgreSQL:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con PostgreSQL:', error);
        return false;
    }
};

module.exports = {
    pool,
    query,
    transaction,
    testConnection
};
