require('dotenv').config();
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { query } = require('../config/db');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const INSIGNIAS_DIR = path.join(__dirname, '../../tresesenta-front/src/assets/insignias');

const BADGES = [
  { file: 'raices-eternas.png', name: 'Raíces Eternas', desc: 'Explora las Raíces Eternas de México' },
  { file: 'sello-agua-y-cacao.png', name: 'Agua y Cacao', desc: 'Descubre la Ruta del Agua y Cacao' },
  { file: 'sello-camino-de-plata.png', name: 'Camino de Plata', desc: 'Recorre el Camino de Plata' },
  { file: 'sello-camino-real.png', name: 'Camino Real', desc: 'Sigue el Camino Real Histórico' },
  { file: 'sello-corazon-del-pais.png', name: 'Corazón del País', desc: 'Visita el Corazón del País' },
  { file: 'sello-costa-bravia.png', name: 'Costa Bravía', desc: 'Explora la Costa Bravía' },
  { file: 'sello-desierto-y-mar.png', name: 'Desierto y Mar', desc: 'Cruza del Desierto al Mar' },
  { file: 'sello-frontera-norte.png', name: 'Frontera Norte', desc: 'Conoce la Frontera Norte' },
  { file: 'sello-golfo-bravo.png', name: 'Golfo Bravo', desc: 'Navega por el Golfo Bravo' },
  { file: 'sello-hidrocalido.png', name: 'Hidrocálido', desc: 'Descubre la Región Hidrocálida' },
  { file: 'sello-huasteca-magica.png', name: 'Huasteca Mágica', desc: 'Adéntrate en la Huasteca Mágica' },
  { file: 'sello-mar-del-cortes.png', name: 'Mar de Cortés', desc: 'Explora el Mar de Cortés' },
  { file: 'sello-norte-indomable.png', name: 'Norte Indomable', desc: 'Conquista el Norte Indomable' },
  { file: 'sello-origen-ancestral.png', name: 'Origen Ancestral', desc: 'Conecta con el Origen Ancestral' },
  { file: 'sello-raices-camelo.png', name: 'Raíces de Camelo', desc: 'Descubre las Raíces de Camelo' },
  { file: 'sello-raices-eternas.png', name: 'Sello Raíces Eternas', desc: 'Obtén el Sello de Raíces Eternas' },
  { file: 'sello-riviera-nayarita.png', name: 'Riviera Nayarita', desc: 'Recorre la Riviera Nayarita' },
  { file: 'sello-sierra-del-norte.png', name: 'Sierra del Norte', desc: 'Escala la Sierra del Norte' },
  { file: 'sello-tierra-del-cine.png', name: 'Tierra del Cine', desc: 'Visita la Tierra del Cine' },
  { file: 'sello-vientos-del-mezquital.png', name: 'Vientos del Mezquital', desc: 'Siente los Vientos del Mezquital' },
  { file: 'sello-volcan-del-paiso.png', name: 'Volcán del Paraíso', desc: 'Sube al Volcán del Paraíso' },
  { file: 'sello-volcan-infinito.png', name: 'Volcán Infinito', desc: 'Alcanza el Volcán Infinito' },
];

async function main() {
  console.log('Subiendo 22 insignias a Cloudinary e insertando en DB...\n');

  // 1. Delete old badges (the 9 generic ones)
  console.log('Eliminando badges anteriores...');
  await query('DELETE FROM user_badges');
  await query('DELETE FROM badges');
  console.log('Badges anteriores eliminados.\n');

  // 2. Upload each image and insert
  for (let i = 0; i < BADGES.length; i++) {
    const badge = BADGES[i];
    const filePath = path.join(INSIGNIAS_DIR, badge.file);

    console.log(`[${i + 1}/22] Subiendo ${badge.name}...`);

    const upload = await cloudinary.uploader.upload(filePath, {
      folder: 'tresesenta/insignias',
      public_id: badge.file.replace('.png', ''),
      overwrite: true,
      transformation: [{ width: 400, height: 400, crop: 'limit', quality: 'auto' }],
    });

    await query(
      `INSERT INTO badges (name, name_es, description, image_url, emoji, is_active, geographic_scope, rarity, category, display_order, points_reward, points_required, condition_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        badge.name,           // name
        badge.name,           // name_es
        badge.desc,           // description
        upload.secure_url,    // image_url
        null,                 // emoji (now we use images)
        true,                 // is_active
        'regional',           // geographic_scope
        'common',             // rarity
        'geographical',       // category
        i + 1,                // display_order
        100,                  // points_reward
        0,                    // points_required
        'region_visit',       // condition_type
      ]
    );

    console.log(`   -> ${upload.secure_url}`);
  }

  console.log('\n22 insignias insertadas correctamente.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
