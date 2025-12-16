/**
 * Migración: Agregar tabla otp_codes y campo shopify_customer_id a users
 */
require('dotenv').config();
const { query } = require('../config/db');

async function migrate() {
  console.log('🚀 Iniciando migración para OTP...\n');

  try {
    // 1. Agregar campo shopify_customer_id a users (si no existe)
    console.log('1. Agregando campo shopify_customer_id a users...');
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS shopify_customer_id VARCHAR(50)
    `);
    console.log('   ✅ Campo shopify_customer_id agregado\n');

    // 2. Crear tabla otp_codes
    console.log('2. Creando tabla otp_codes...');
    await query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        attempts INTEGER DEFAULT 0,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Tabla otp_codes creada\n');

    // 3. Crear índices
    console.log('3. Creando índices...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_shopify ON users(shopify_customer_id)
    `);
    console.log('   ✅ Índices creados\n');

    console.log('🎉 Migración completada exitosamente!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
