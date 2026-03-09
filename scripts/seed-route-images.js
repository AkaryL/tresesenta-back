require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000
});

const run = async () => {
  // Add cover_image_url to routes if not exists
  await pool.query(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)`);
  console.log('Column added');

  // Update route cover images (picsum seeds = consistent beautiful photos)
  const routeImages = [
    { id: 1, url: 'https://images.unsplash.com/photo-1612294037637-ec328d0e075e?w=700&q=80' }, // Guadalajara
    { id: 2, url: 'https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=700&q=80' }, // CDMX
    { id: 3, url: 'https://images.unsplash.com/photo-1555990538-c4ef6c44e4a0?w=700&q=80' }, // Oaxaca
    { id: 4, url: 'https://images.unsplash.com/photo-1568700657440-9e7c2b9c5f16?w=700&q=80' }, // Guanajuato
  ];
  for (const r of routeImages) {
    await pool.query('UPDATE routes SET cover_image_url = $1 WHERE id = $2', [r.url, r.id]);
    console.log('Updated route', r.id);
  }

  // Add images to pins (using picsum with pin-name seeds for consistent results)
  const pinImages = [
    { id: 2,  url: 'https://picsum.photos/seed/angel-independencia/400/300' },
    { id: 3,  url: 'https://picsum.photos/seed/cafe-avellaneda/400/300' },
    { id: 4,  url: 'https://picsum.photos/seed/frida-kahlo/400/300' },
    { id: 5,  url: 'https://picsum.photos/seed/mercado-roma/400/300' },
    { id: 6,  url: 'https://picsum.photos/seed/hospicio-cabanas/400/300' },
    { id: 7,  url: 'https://picsum.photos/seed/nueve-esquinas/400/300' },
    { id: 8,  url: 'https://picsum.photos/seed/cafe-benito/400/300' },
    { id: 11, url: 'https://picsum.photos/seed/monte-alban/400/300' },
    { id: 12, url: 'https://picsum.photos/seed/mercado-noviembre/400/300' },
    { id: 13, url: 'https://picsum.photos/seed/cafe-brujula/400/300' },
    { id: 14, url: 'https://picsum.photos/seed/callejon-beso/400/300' },
    { id: 15, url: 'https://picsum.photos/seed/momias/400/300' },
  ];
  for (const p of pinImages) {
    await pool.query('UPDATE pins SET image_urls = $1 WHERE id = $2 AND (image_urls IS NULL OR image_urls = \'{}\')',
      [[p.url], p.id]);
    console.log('Updated pin', p.id);
  }
  pool.end();
  console.log('Done!');
};

run().catch(e => { console.error(e.message); pool.end(); });
