-- Migración: Actualizar categorías para Mapa 360
-- Ejecutar este script para actualizar las categorías existentes

-- Actualizar 'restaurante' a 'restaurantes'
UPDATE categories
SET name = 'restaurantes',
    name_es = 'Restaurantes'
WHERE name = 'restaurante';

-- Actualizar 'cultura' a 'lugares_publicos'
UPDATE categories
SET name = 'lugares_publicos',
    name_es = 'Lugares Públicos',
    emoji = '🏛️',
    color = '#85c1e9',
    description = 'Plazas, monumentos y espacios públicos'
WHERE name = 'cultura';

-- Actualizar color de vida_nocturna
UPDATE categories
SET color = '#3498db'
WHERE name = 'vida_nocturna';

-- Verificar las categorías actualizadas
SELECT * FROM categories ORDER BY id;
