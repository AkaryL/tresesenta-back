const { pool } = require('../config/db');
const bcrypt = require('bcrypt');

async function seedData() {
  const client = await pool.connect();

  try {
    console.log('🌱 Iniciando seed de datos realistas...\n');

    // ===== 1. CREAR USUARIOS =====
    console.log('👥 Creando usuarios...');
    const password = await bcrypt.hash('password123', 10);

    const users = [
      { username: 'ana_mx', email: 'ana@example.com', full_name: 'Ana López', points: 350, level: 'Explorador Urbano' },
      { username: 'carlos_viajero', email: 'carlos@example.com', full_name: 'Carlos Hernández', points: 520, level: 'Trotamundos' },
      { username: 'sofia_cdmx', email: 'sofia@example.com', full_name: 'Sofía Ramírez', points: 180, level: 'Local' },
      { username: 'diego_foodie', email: 'diego@example.com', full_name: 'Diego Martínez', points: 420, level: 'Explorador Urbano' },
      { username: 'lucia_arte', email: 'lucia@example.com', full_name: 'Lucía Torres', points: 290, level: 'Explorador Urbano' },
      { username: 'miguel_aventura', email: 'miguel@example.com', full_name: 'Miguel Sánchez', points: 610, level: 'Trotamundos' },
      { username: 'valeria_cafe', email: 'valeria@example.com', full_name: 'Valeria García', points: 240, level: 'Local' }
    ];

    const userIds = [];
    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, total_points, level)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [user.username, user.email, password, user.full_name, user.points, user.level]
      );
      userIds.push(result.rows[0].id);
      console.log(`  ✅ ${user.username} creado`);
    }

    // ===== 2. CREAR PINS REALISTAS =====
    console.log('\n📍 Creando 20 pins realistas por México...');

    const pins = [
      // CDMX
      {
        user_id: userIds[0], category_id: 1, city_id: 1,
        title: 'Ángel de la Independencia',
        description: 'Icono de la CDMX, perfecto para fotos al atardecer. El dorado brilla increíble con el sol de las 6pm.',
        location_name: 'Paseo de la Reforma',
        latitude: 19.4270, longitude: -99.1676
      },
      {
        user_id: userIds[1], category_id: 3, city_id: 1,
        title: 'Café Avellaneda',
        description: 'Mejor cappuccino de la Roma. El lugar es pequeño pero súper acogedor. Tienen pan de masa madre delicioso.',
        location_name: 'Colonia Roma Norte',
        latitude: 19.4150, longitude: -99.1620
      },
      {
        user_id: userIds[2], category_id: 5, city_id: 1,
        title: 'Museo Frida Kahlo (Casa Azul)',
        description: 'La casa donde vivió Frida. Es pequeña pero cada rincón cuenta una historia. Compra boletos en línea!',
        location_name: 'Coyoacán',
        latitude: 19.3551, longitude: -99.1620
      },
      {
        user_id: userIds[3], category_id: 4, city_id: 1,
        title: 'Mercado Roma',
        description: 'La mejor comida de México en un solo lugar. Los tacos de cochinita y las tlayudas son 10/10.',
        location_name: 'Colonia Roma Norte',
        latitude: 19.4124, longitude: -99.1625
      },

      // Guadalajara
      {
        user_id: userIds[4], category_id: 1, city_id: 2,
        title: 'Hospicio Cabañas',
        description: 'Los murales de Orozco en la cúpula son impresionantes. Patrimonio de la humanidad por una razón.',
        location_name: 'Centro Histórico',
        latitude: 20.6766, longitude: -103.3476
      },
      {
        user_id: userIds[5], category_id: 4, city_id: 2,
        title: 'Las Nueve Esquinas',
        description: 'La zona de bares más auténtica de Guadalajara. Ambiente local, música en vivo y mezcal de calidad.',
        location_name: 'Chapultepec',
        latitude: 20.6755, longitude: -103.3620
      },
      {
        user_id: userIds[0], category_id: 3, city_id: 2,
        title: 'Café Benito Juárez',
        description: 'Café de especialidad en el centro. El cold brew es espectacular y los barristas son muy amables.',
        location_name: 'Centro',
        latitude: 20.6780, longitude: -103.3450
      },

      // Monterrey
      {
        user_id: userIds[1], category_id: 2, city_id: 3,
        title: 'Parque La Huasteca',
        description: 'Para los amantes del senderismo. Las vistas desde arriba son increíbles, especialmente al amanecer.',
        location_name: 'Santa Catarina',
        latitude: 25.6520, longitude: -100.4520
      },
      {
        user_id: userIds[3], category_id: 4, city_id: 3,
        title: 'Barrio Antiguo',
        description: 'El corazón nocturno de Monterrey. Calles coloridas, bares variados y siempre buen ambiente.',
        location_name: 'Centro',
        latitude: 25.6720, longitude: -100.3100
      },

      // Oaxaca
      {
        user_id: userIds[2], category_id: 1, city_id: 6,
        title: 'Monte Albán',
        description: 'Zona arqueológica zapoteca espectacular. Llega temprano para evitar el calor. Las vistas son 360°.',
        location_name: 'Monte Albán',
        latitude: 17.0435, longitude: -96.7677
      },
      {
        user_id: userIds[4], category_id: 4, city_id: 6,
        title: 'Mercado 20 de Noviembre',
        description: 'Aquí probé el mejor mole negro de mi vida. El pasillo de los tlayudas es un must. Vayan con hambre!',
        location_name: 'Centro Histórico',
        latitude: 17.0654, longitude: -96.7264
      },
      {
        user_id: userIds[5], category_id: 3, city_id: 6,
        title: 'Café Brújula',
        description: 'Café orgánico de Oaxaca. Puedes ver todo el proceso del grano. El cortado es perfección.',
        location_name: 'Centro',
        latitude: 17.0670, longitude: -96.7230
      },

      // Guanajuato
      {
        user_id: userIds[0], category_id: 6, city_id: 9,
        title: 'Callejón del Beso',
        description: 'Súper turístico pero vale la pena. El callejón es TAN estrecho que te da claustrofobia jaja.',
        location_name: 'Centro Histórico',
        latitude: 21.0175, longitude: -101.2565
      },
      {
        user_id: userIds[1], category_id: 5, city_id: 9,
        title: 'Museo de las Momias',
        description: 'Espeluznante pero fascinante. No es para todos, pero es algo único que solo encuentras aquí.',
        location_name: 'Explanada del Panteón',
        latitude: 21.0089, longitude: -101.2650
      },

      // Puebla
      {
        user_id: userIds[3], category_id: 1, city_id: 4,
        title: 'Catedral de Puebla',
        description: 'La fachada es hermosa pero el interior es donde está la magia. Las torres son las más altas de México.',
        location_name: 'Zócalo de Puebla',
        latitude: 19.0415, longitude: -98.1979
      },
      {
        user_id: userIds[2], category_id: 3, city_id: 4,
        title: 'Café Teorema',
        description: 'Cafetería escondida en el centro. El lugar perfecto para trabajar o leer. Wifi rápido y buen café.',
        location_name: 'Centro Histórico',
        latitude: 19.0440, longitude: -98.2000
      },

      // Mérida
      {
        user_id: userIds[4], category_id: 2, city_id: 7,
        title: 'Cenote Xlacah',
        description: 'Cenote dentro de Dzibilchaltún. El agua está cristalina y hay pocas personas. Mágico.',
        location_name: 'Dzibilchaltún',
        latitude: 21.0890, longitude: -89.5910
      },
      {
        user_id: userIds[5], category_id: 4, city_id: 7,
        title: 'La Negrita Cantina',
        description: 'Cantina tradicional yucateca. Botanas gratis con cada cerveza y música de trova en vivo los jueves.',
        location_name: 'Centro',
        latitude: 20.9700, longitude: -89.6200
      },

      // Puerto Vallarta
      {
        user_id: userIds[0], category_id: 2, city_id: 8,
        title: 'Playa Las Gemelas',
        description: 'Playa escondida, solo accesible por agua. Perfecta para snorkel, vi tortugas y peces de colores.',
        location_name: 'Zona Sur',
        latitude: 20.5980, longitude: -105.2450
      },

      // Querétaro
      {
        user_id: userIds[1], category_id: 1, city_id: 5,
        title: 'Acueducto de Querétaro',
        description: 'Impresionante obra de ingeniería del siglo XVIII. Las fotos desde abajo son épicas.',
        location_name: 'Centro Histórico',
        latitude: 20.5930, longitude: -100.3910
      }
    ];

    const pinIds = [];
    for (const pin of pins) {
      const result = await client.query(
        `INSERT INTO pins (user_id, category_id, city_id, title, description, location_name, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [pin.user_id, pin.category_id, pin.city_id, pin.title, pin.description,
         pin.location_name, pin.latitude, pin.longitude]
      );
      pinIds.push(result.rows[0].id);
      console.log(`  ✅ ${pin.title}`);
    }

    // ===== 3. CREAR LIKES =====
    console.log('\n❤️  Creando likes...');

    const likesData = [
      // Pin 1 (Ángel) - 5 likes
      { user_id: userIds[1], pin_id: pinIds[0] },
      { user_id: userIds[2], pin_id: pinIds[0] },
      { user_id: userIds[3], pin_id: pinIds[0] },
      { user_id: userIds[4], pin_id: pinIds[0] },
      { user_id: userIds[5], pin_id: pinIds[0] },

      // Pin 2 (Café Avellaneda) - 4 likes
      { user_id: userIds[0], pin_id: pinIds[1] },
      { user_id: userIds[2], pin_id: pinIds[1] },
      { user_id: userIds[4], pin_id: pinIds[1] },
      { user_id: userIds[6], pin_id: pinIds[1] },

      // Pin 3 (Casa Azul) - 6 likes
      { user_id: userIds[0], pin_id: pinIds[2] },
      { user_id: userIds[1], pin_id: pinIds[2] },
      { user_id: userIds[3], pin_id: pinIds[2] },
      { user_id: userIds[4], pin_id: pinIds[2] },
      { user_id: userIds[5], pin_id: pinIds[2] },
      { user_id: userIds[6], pin_id: pinIds[2] },

      // Pin 4 (Mercado Roma) - 3 likes
      { user_id: userIds[1], pin_id: pinIds[3] },
      { user_id: userIds[2], pin_id: pinIds[3] },
      { user_id: userIds[5], pin_id: pinIds[3] },

      // Pin 10 (Monte Albán) - 5 likes
      { user_id: userIds[0], pin_id: pinIds[9] },
      { user_id: userIds[1], pin_id: pinIds[9] },
      { user_id: userIds[3], pin_id: pinIds[9] },
      { user_id: userIds[5], pin_id: pinIds[9] },
      { user_id: userIds[6], pin_id: pinIds[9] },

      // Más likes distribuidos
      { user_id: userIds[0], pin_id: pinIds[5] },
      { user_id: userIds[1], pin_id: pinIds[7] },
      { user_id: userIds[2], pin_id: pinIds[11] },
      { user_id: userIds[3], pin_id: pinIds[14] },
      { user_id: userIds[4], pin_id: pinIds[16] },
      { user_id: userIds[5], pin_id: pinIds[18] },
    ];

    for (const like of likesData) {
      await client.query(
        'INSERT INTO likes (user_id, pin_id) VALUES ($1, $2)',
        [like.user_id, like.pin_id]
      );
    }
    console.log(`  ✅ ${likesData.length} likes creados`);

    // ===== 4. CREAR COMENTARIOS REALISTAS =====
    console.log('\n💬 Creando comentarios...');

    const comments = [
      // Pin 1 (Ángel)
      { user_id: userIds[1], pin_id: pinIds[0], content: 'Fui la semana pasada y justo atrapé el atardecer dorado, quedé 😍' },
      { user_id: userIds[3], pin_id: pinIds[0], content: 'Tip: vayan entre semana, los fines está súper lleno' },

      // Pin 2 (Café Avellaneda)
      { user_id: userIds[0], pin_id: pinIds[1], content: 'El mejor café de la Roma, sin duda' },
      { user_id: userIds[6], pin_id: pinIds[1], content: 'Acabo de ir por tu recomendación! El flat white está increíble ☕' },
      { user_id: userIds[4], pin_id: pinIds[1], content: 'Se llenó cañón desde que lo subieron aquí jajaja pero sí está buenísimo' },

      // Pin 3 (Casa Azul)
      { user_id: userIds[1], pin_id: pinIds[2], content: 'Totalmente de acuerdo con comprar en línea, las filas son eternas' },
      { user_id: userIds[5], pin_id: pinIds[2], content: 'El jardín es mi parte favorita, súper tranquilo 🌿' },

      // Pin 4 (Mercado Roma)
      { user_id: userIds[2], pin_id: pinIds[3], content: 'Los fines de semana hay música en vivo también!' },

      // Pin 5 (Hospicio Cabañas)
      { user_id: userIds[0], pin_id: pinIds[4], content: 'Necesito ir a Guadalajara ya, se ve increíble' },

      // Pin 10 (Monte Albán)
      { user_id: userIds[1], pin_id: pinIds[9], content: 'Una de las mejores zonas arqueológicas que he visitado. Las vistas son de otro mundo' },
      { user_id: userIds[3], pin_id: pinIds[9], content: 'Fui en agosto y el calor estaba insoportable jaja, recomiendo ir en invierno' },

      // Pin 11 (Mercado 20 Noviembre)
      { user_id: userIds[0], pin_id: pinIds[10], content: 'Alguien más probó el tejate? Es raro pero rico jaja' },
      { user_id: userIds[2], pin_id: pinIds[10], content: 'El mole negro es GOD TIER 🔥' },

      // Pin 13 (Callejón del Beso)
      { user_id: userIds[2], pin_id: pinIds[12], content: 'Es turístico pero tienes que ir aunque sea una vez' },

      // Pin 16 (Cenote)
      { user_id: userIds[1], pin_id: pinIds[15], content: 'Qué padre! No conocía este cenote, solo los más turísticos' },

      // Pin 19 (Playa Gemelas)
      { user_id: userIds[2], pin_id: pinIds[17], content: 'Cuánto cuesta el bote para llegar?' },
      { user_id: userIds[0], pin_id: pinIds[17], content: 'Creo que como 500 pesos por persona ida y vuelta' },
    ];

    for (const comment of comments) {
      await client.query(
        'INSERT INTO comments (user_id, pin_id, content) VALUES ($1, $2, $3)',
        [comment.user_id, comment.pin_id, comment.content]
      );
    }
    console.log(`  ✅ ${comments.length} comentarios creados`);

    console.log('\n✨ ¡Seed completado exitosamente!\n');
    console.log('📊 Resumen:');
    console.log(`   - ${users.length} usuarios creados`);
    console.log(`   - ${pins.length} pins creados`);
    console.log(`   - ${likesData.length} likes creados`);
    console.log(`   - ${comments.length} comentarios creados\n`);
    console.log('🗺️  Ciudades con pins:');
    console.log('   - CDMX (4 pins)');
    console.log('   - Guadalajara (3 pins)');
    console.log('   - Monterrey (2 pins)');
    console.log('   - Oaxaca (3 pins)');
    console.log('   - Guanajuato (2 pins)');
    console.log('   - Puebla (2 pins)');
    console.log('   - Mérida (2 pins)');
    console.log('   - Puerto Vallarta (1 pin)');
    console.log('   - Querétaro (1 pin)\n');

  } catch (error) {
    console.error('❌ Error en seed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedData();
