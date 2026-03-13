require('dotenv').config();
const { query } = require('../config/db');

const mapping = {
  10: 'Chiapas',
  11: 'Tabasco',
  12: 'Zacatecas',
  13: 'Chihuahua',
  14: 'Ciudad de México',
  15: 'Guerrero',
  16: 'Sonora',
  17: 'Baja California',
  18: 'Tamaulipas',
  19: 'Aguascalientes',
  20: 'San Luis Potosí',
  21: 'Baja California Sur',
  22: 'Coahuila',
  23: 'Oaxaca',
  24: 'Campeche',
  25: 'Estado de México',
  26: 'Nayarit',
  27: 'Puebla',
  28: 'Durango',
  29: 'Hidalgo',
  30: 'Colima',
  31: 'Jalisco',
};

(async () => {
  for (const [id, state] of Object.entries(mapping)) {
    await query('UPDATE badges SET scope_value = $1, geographic_scope = $2 WHERE id = $3', [state, 'state', id]);
    console.log(`Badge ${id} -> ${state}`);
  }
  console.log('Done!');
  process.exit();
})();
