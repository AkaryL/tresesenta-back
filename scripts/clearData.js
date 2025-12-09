const { pool } = require('../config/db');

async function clearData() {
  const client = await pool.connect();

  try {
    console.log('🗑️  Limpiando TODA la base de datos (excepto usuarios)...\n');

    // Borrar en orden para respetar foreign keys

    // 1. Borrar comentarios
    const commentsResult = await client.query('DELETE FROM comments');
    console.log(`✅ Comentarios borrados: ${commentsResult.rowCount}`);

    // 2. Borrar likes
    const likesResult = await client.query('DELETE FROM likes');
    console.log(`✅ Likes borrados: ${likesResult.rowCount}`);

    // 3. Borrar pins
    const pinsResult = await client.query('DELETE FROM pins');
    console.log(`✅ Pins borrados: ${pinsResult.rowCount}`);

    // 4. Resetear puntos de usuarios a 0
    const pointsResult = await client.query('UPDATE users SET total_points = 0, level = 1');
    console.log(`✅ Puntos de usuarios reseteados: ${pointsResult.rowCount} usuarios`);

    console.log('\n✨ Base de datos limpiada exitosamente! TODO borrado excepto usuarios y categorías.\n');

  } catch (error) {
    console.error('❌ Error limpiando base de datos:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

clearData();
