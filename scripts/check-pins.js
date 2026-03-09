require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000
});

pool.query(`
  SELECT p.id, p.title, p.image_urls, p.latitude, p.longitude, c.name_es as cat, c.emoji as cat_emoji
  FROM pins p LEFT JOIN categories c ON p.category_id = c.id
  WHERE p.id IN (2,3,4,5,6,7,8,11,12,13,14,15)
  ORDER BY p.id
`).then(r => {
  r.rows.forEach(p => console.log(p.id, p.cat_emoji, p.cat, '|', p.title, '| imgs:', p.image_urls?.length || 0, p.image_urls?.[0]?.substring(0,60) || ''));
  // Also check categories
  return pool.query('SELECT id, name_es, emoji, color FROM categories ORDER BY id');
}).then(r => {
  console.log('\nCategories:');
  r.rows.forEach(c => console.log(c.id, c.emoji, c.name_es));
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
