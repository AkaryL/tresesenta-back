const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('../config/db');

const setupDatabase = async () => {
    try {
        console.log('🔄 Iniciando configuración de base de datos...\n');

        // Test connection first
        const connected = await testConnection();
        if (!connected) {
            throw new Error('No se pudo conectar a la base de datos');
        }

        // Read schema file
        const schemaPath = path.join(__dirname, '../../database/schema.sql');
        console.log('📄 Leyendo archivo de schema:', schemaPath);

        const schema = fs.readFileSync(schemaPath, 'utf-8');

        // Execute schema
        console.log('⚙️  Ejecutando schema SQL...\n');
        await pool.query(schema);

        console.log('✅ Base de datos configurada exitosamente!');
        console.log('\nTablas creadas:');
        console.log('  - users');
        console.log('  - purchases');
        console.log('  - categories (con datos)');
        console.log('  - cities (con datos)');
        console.log('  - pins');
        console.log('  - likes');
        console.log('  - comments');
        console.log('  - badges (con datos)');
        console.log('  - user_badges');
        console.log('  - routes');
        console.log('  - route_pins');
        console.log('  - user_cities');
        console.log('\n🎉 ¡Listo para usar!\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error al configurar la base de datos:', error.message);
        console.error(error);
        process.exit(1);
    }
};

setupDatabase();
