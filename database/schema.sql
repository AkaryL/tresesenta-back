-- ====================================
-- TRESESENTA MAPA360 - Database Schema
-- PostgreSQL
-- Actualizado según documento Mapa 360 Oficial
-- ====================================

-- Eliminar tablas si existen (para desarrollo)
DROP TABLE IF EXISTS verification_requests CASCADE;
DROP TABLE IF EXISTS point_transactions CASCADE;
DROP TABLE IF EXISTS user_daily_stats CASCADE;
DROP TABLE IF EXISTS point_actions CASCADE;
DROP TABLE IF EXISTS admin_settings CASCADE;
DROP TABLE IF EXISTS user_cities CASCADE;
DROP TABLE IF EXISTS route_pins CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS badges CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS pins CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS cities CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ====================================
-- TABLA: users
-- ====================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) DEFAULT '',  -- Opcional: solo para login legacy, OTP no lo usa
    full_name VARCHAR(100),
    avatar_url VARCHAR(500),
    total_points INTEGER DEFAULT 0,
    level VARCHAR(50) DEFAULT 'Local',
    ranking_position INTEGER,
    profile_color VARCHAR(20) DEFAULT '#000000',  -- Color del Pasaporte 360
    is_admin BOOLEAN DEFAULT FALSE,  -- Administrador del sistema
    is_verified_buyer BOOLEAN DEFAULT FALSE,  -- Comprador verificado de TRESESENTA
    is_banned BOOLEAN DEFAULT FALSE,  -- Usuario baneado
    ban_reason TEXT,
    shopify_customer_id VARCHAR(100),  -- ID del customer en Shopify
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- TABLA: purchases
-- ====================================
CREATE TABLE purchases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_id VARCHAR(100) UNIQUE NOT NULL,
    product_name VARCHAR(200),
    product_model VARCHAR(100),
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified BOOLEAN DEFAULT FALSE
);

-- ====================================
-- TABLA: categories
-- ====================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    name_es VARCHAR(50) NOT NULL,
    emoji VARCHAR(10),
    color VARCHAR(20),
    description TEXT
);

-- Insertar categorías predefinidas (según diseño Mapa 360)
INSERT INTO categories (name, name_es, emoji, color, description) VALUES
('parques', 'Parques', '🌳', '#7ed957', 'Parques, jardines y espacios verdes'),
('cafeteria', 'Cafetería', '☕', '#f5a623', 'Cafeterías y lugares para café'),
('restaurantes', 'Restaurantes', '🍽️', '#9b59b6', 'Restaurantes y lugares para comer'),
('vida_nocturna', 'Vida Nocturna', '🍸', '#3498db', 'Bares, antros y vida nocturna'),
('lugares_publicos', 'Lugares Públicos', '🏛️', '#85c1e9', 'Plazas, monumentos y espacios públicos'),
('favoritos', 'Favoritos', '⭐', '#f1c40f', 'Lugares favoritos de la comunidad');

-- ====================================
-- TABLA: cities
-- ====================================
CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    region VARCHAR(100),
    emoji VARCHAR(10),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar ciudades principales de México
INSERT INTO cities (name, region, emoji, latitude, longitude) VALUES
('CDMX', 'Centro', '🏛️', 19.4326, -99.1332),
('Guadalajara', 'Occidente', '🌮', 20.6767, -103.3475),
('Monterrey', 'Norte', '🏔️', 25.6866, -100.3161),
('Puebla', 'Centro', '🏰', 19.0414, -98.2063),
('Querétaro', 'Centro', '🎭', 20.5888, -100.3899),
('Oaxaca', 'Sureste', '🎉', 17.0732, -96.7266),
('Mérida', 'Sureste', '🌺', 20.9674, -89.5926),
('Puerto Vallarta', 'Occidente', '🏖️', 20.6534, -105.2253),
('Guanajuato', 'Centro', '🎨', 21.0190, -101.2574),
('Morelia', 'Occidente', '🏛️', 19.7068, -101.1947);

-- ====================================
-- TABLA: pins
-- ====================================
CREATE TABLE pins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    location_name VARCHAR(200),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    city_id INTEGER REFERENCES cities(id),
    shoe_model VARCHAR(100),
    image_urls TEXT[], -- Array de URLs de imágenes
    video_url VARCHAR(500),
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    points_awarded INTEGER DEFAULT 20,
    is_featured BOOLEAN DEFAULT FALSE,
    -- Campos de verificación "Usé mis tenis Tresesenta"
    used_tresesenta BOOLEAN DEFAULT FALSE,  -- Usuario marcó que usó sus tenis
    verification_status VARCHAR(20) DEFAULT 'none',  -- 'none', 'pending', 'approved', 'rejected'
    verification_notes TEXT,  -- Notas del admin sobre la verificación
    verified_by INTEGER REFERENCES users(id),  -- Admin que verificó
    verified_at TIMESTAMP,
    -- Moderación
    is_hidden BOOLEAN DEFAULT FALSE,  -- Pin oculto por moderación
    hidden_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- TABLA: likes
-- ====================================
CREATE TABLE likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    pin_id INTEGER REFERENCES pins(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, pin_id) -- Un usuario solo puede dar like una vez por pin
);

-- ====================================
-- TABLA: comments
-- ====================================
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    pin_id INTEGER REFERENCES pins(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- TABLA: badges (medallas/logros)
-- Sistema dinámico administrado desde panel admin
-- ====================================
CREATE TABLE badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_es VARCHAR(100) NOT NULL,
    description TEXT,
    emoji VARCHAR(10),
    points_required INTEGER,
    points_reward INTEGER DEFAULT 0,  -- Puntos que otorga al obtener la medalla
    condition_type VARCHAR(50), -- 'posts_in_state', 'complete_route', 'total_posts', 'category_count', etc.
    condition_value JSONB, -- Datos adicionales de la condición
    image_url VARCHAR(500),
    -- Campos de administración
    is_active BOOLEAN DEFAULT TRUE,  -- Activa/Inactiva desde admin
    geographic_scope VARCHAR(50) DEFAULT 'national',  -- 'national', 'regional', 'city'
    scope_value VARCHAR(100),  -- ID de la ciudad o región si aplica
    display_order INTEGER DEFAULT 0,  -- Orden de visualización
    category VARCHAR(50),  -- Categoría de la medalla: 'explorador', 'social', 'especial', etc.
    rarity VARCHAR(20) DEFAULT 'common',  -- 'common', 'rare', 'epic', 'legendary'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar badges predefinidos (Sistema de Medallas Mapa 360 - Página 7 del PDF)
INSERT INTO badges (name, name_es, description, emoji, points_required, points_reward, condition_type, condition_value, category, rarity, geographic_scope, display_order) VALUES
-- Medallas de Exploración
('sello_regional', 'Sello Regional', 'Publica 3 posts del mismo estado', '🏆', 0, 50, 'posts_in_state', '{"posts": 3}', 'explorador', 'common', 'regional', 1),
('explorador_local', 'Explorador Local', 'Publica 5 pins en tu ciudad', '📍', 0, 30, 'pins_in_city', '{"count": 5}', 'explorador', 'common', 'city', 2),
('trotamundos', 'Trotamundos', 'Visita 5 ciudades diferentes', '✈️', 0, 100, 'cities_visited', '{"count": 5}', 'explorador', 'rare', 'national', 3),
('atlas', 'Atlas', 'Visita 10 ciudades diferentes', '🗺️', 0, 200, 'cities_visited', '{"count": 10}', 'explorador', 'epic', 'national', 4),
('explorador_universal', 'Explorador Universal', 'Visita 15 ciudades diferentes', '🌍', 0, 500, 'cities_visited', '{"count": 15}', 'explorador', 'legendary', 'national', 5),

-- Medallas por Categoría
('catador', 'Catador', 'Visita 5 cafeterías diferentes', '☕', 0, 50, 'category_count', '{"category": "cafeteria", "count": 5}', 'categoria', 'common', 'national', 10),
('explorador_verde', 'Explorador Verde', 'Visita 5 parques diferentes', '🌿', 0, 50, 'category_count', '{"category": "parques", "count": 5}', 'categoria', 'common', 'national', 11),
('amante_cultura', 'Amante de la Cultura', 'Visita 5 lugares culturales', '🎨', 0, 50, 'category_count', '{"category": "cultura", "count": 5}', 'categoria', 'common', 'national', 12),
('foodie', 'Foodie', 'Publica 10 restaurantes', '🌮', 0, 75, 'category_count', '{"category": "restaurante", "count": 10}', 'categoria', 'rare', 'national', 13),
('nocturno', 'Nocturno', 'Visita 5 lugares de vida nocturna', '🌙', 0, 50, 'category_count', '{"category": "vida_nocturna", "count": 5}', 'categoria', 'common', 'national', 14),

-- Medallas Sociales
('influencer', 'Influencer', 'Recibe 100 likes en total', '❤️', 0, 100, 'total_likes_received', '{"count": 100}', 'social', 'rare', 'national', 20),
('comentarista', 'Comentarista', 'Haz 50 comentarios', '💬', 0, 50, 'total_comments', '{"count": 50}', 'social', 'common', 'national', 21),
('popular', 'Popular', 'Recibe 50 comentarios', '🌟', 0, 75, 'comments_received', '{"count": 50}', 'social', 'rare', 'national', 22),

-- Medallas de Rutas
('ruta_completa', 'Ruta Completa', 'Completa una ruta oficial', '🛤️', 0, 100, 'complete_route', '{"count": 1}', 'rutas', 'rare', 'national', 30),
('rutero', 'Rutero', 'Completa 5 rutas', '🚶', 0, 200, 'complete_route', '{"count": 5}', 'rutas', 'epic', 'national', 31),

-- Medallas Especiales
('tresesenta_fan', 'Fan TRESESENTA', 'Usa tus tenis TRESESENTA en 10 publicaciones', '👟', 0, 150, 'tresesenta_posts', '{"count": 10}', 'especial', 'rare', 'national', 40),
('comprador_verificado', 'Comprador Verificado', 'Verifica tu compra de TRESESENTA', '✓', 0, 200, 'verified_purchase', '{}', 'especial', 'epic', 'national', 41),
('leyenda', 'Leyenda', 'Alcanza 5000 puntos', '👑', 5000, 300, 'total_points', '{"points": 5000}', 'especial', 'legendary', 'national', 50),
('coleccionista', 'Coleccionista', 'Obtén 10 medallas', '🏅', 0, 250, 'badges_earned', '{"count": 10}', 'especial', 'legendary', 'national', 51),

-- Medallas de Constancia
('consistente', 'Consistente', 'Entra 7 días seguidos', '🔥', 0, 50, 'login_streak', '{"days": 7}', 'constancia', 'common', 'national', 60),
('dedicado', 'Dedicado', 'Entra 30 días seguidos', '💪', 0, 200, 'login_streak', '{"days": 30}', 'constancia', 'epic', 'national', 61);

-- ====================================
-- TABLA: user_badges
-- ====================================
CREATE TABLE user_badges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    badge_id INTEGER REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
);

-- ====================================
-- TABLA: routes (rutas curadas)
-- ====================================
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    emoji VARCHAR(10),
    total_pins INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    completions_count INTEGER DEFAULT 0,
    difficulty VARCHAR(20), -- 'easy', 'medium', 'hard'
    estimated_time VARCHAR(50), -- 'medio día', '1 día completo', etc.
    is_official BOOLEAN DEFAULT FALSE, -- Ruta oficial de TRESESENTA
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- TABLA: route_pins
-- ====================================
CREATE TABLE route_pins (
    id SERIAL PRIMARY KEY,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    pin_id INTEGER REFERENCES pins(id) ON DELETE CASCADE,
    order_index INTEGER, -- Orden del pin en la ruta
    is_required BOOLEAN DEFAULT TRUE, -- Si es obligatorio para completar la ruta
    UNIQUE(route_id, pin_id)
);

-- ====================================
-- TABLA: user_cities (ciudades visitadas)
-- ====================================
CREATE TABLE user_cities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    city_id INTEGER REFERENCES cities(id) ON DELETE CASCADE,
    pins_count INTEGER DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    first_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, city_id)
);

-- ====================================
-- TABLA: admin_settings
-- Configuración global del sistema
-- ====================================
CREATE TABLE admin_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50),  -- 'points', 'limits', 'moderation', 'general'
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Configuraciones por defecto
INSERT INTO admin_settings (setting_key, setting_value, description, category) VALUES
('daily_comment_limit', '{"value": 20}', 'Límite diario de comentarios por usuario', 'limits'),
('daily_photo_limit', '{"value": 5}', 'Límite diario de fotos por usuario', 'limits'),
('daily_like_limit', '{"value": 50}', 'Límite diario de likes por usuario', 'limits'),
('comment_cooldown_seconds', '{"value": 30}', 'Segundos de espera entre comentarios', 'limits'),
('photo_cooldown_seconds', '{"value": 60}', 'Segundos de espera entre fotos', 'limits'),
('require_tresesenta_verification', '{"value": true}', 'Requiere verificación de tenis TRESESENTA', 'moderation'),
('auto_approve_verified_buyers', '{"value": true}', 'Auto-aprobar posts de compradores verificados', 'moderation'),
('points_multiplier', '{"value": 1.0}', 'Multiplicador global de puntos', 'points'),
('max_points_per_day', '{"value": 500}', 'Máximo de puntos que se pueden ganar por día', 'points');

-- ====================================
-- TABLA: point_actions
-- Sistema de puntos configurable desde admin (Página 8 del PDF)
-- ====================================
CREATE TABLE point_actions (
    id SERIAL PRIMARY KEY,
    action_code VARCHAR(50) UNIQUE NOT NULL,  -- Código único de la acción
    action_name VARCHAR(100) NOT NULL,
    action_name_es VARCHAR(100) NOT NULL,
    description TEXT,
    points INTEGER NOT NULL DEFAULT 0,
    -- Límites y cooldowns
    daily_limit INTEGER,  -- NULL = sin límite
    cooldown_seconds INTEGER DEFAULT 0,  -- Segundos entre acciones
    -- Configuración
    is_active BOOLEAN DEFAULT TRUE,
    requires_verification BOOLEAN DEFAULT FALSE,  -- Requiere verificación de admin
    category VARCHAR(50),  -- 'content', 'social', 'exploration', 'special'
    -- Multiplicadores
    verified_buyer_multiplier DECIMAL(3,2) DEFAULT 1.0,  -- Multiplicador para compradores verificados
    tresesenta_bonus INTEGER DEFAULT 0,  -- Puntos extra si usó tenis TRESESENTA
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar acciones de puntos según el PDF (Página 8)
INSERT INTO point_actions (action_code, action_name, action_name_es, points, daily_limit, cooldown_seconds, category, tresesenta_bonus, description) VALUES
-- Creación de contenido
('create_pin', 'Create Pin', 'Crear Pin', 20, 5, 60, 'content', 10, 'Puntos por crear un nuevo pin'),
('create_pin_with_photo', 'Create Pin with Photo', 'Crear Pin con Foto', 25, 5, 60, 'content', 15, 'Puntos por crear pin con foto'),
('create_pin_with_video', 'Create Pin with Video', 'Crear Pin con Video', 30, 3, 120, 'content', 20, 'Puntos por crear pin con video'),
('add_photo_to_pin', 'Add Photo', 'Agregar Foto', 5, 10, 30, 'content', 5, 'Puntos por agregar foto a pin existente'),
-- Interacción social
('like_pin', 'Like Pin', 'Dar Like', 1, 50, 0, 'social', 0, 'Puntos por dar like'),
('receive_like', 'Receive Like', 'Recibir Like', 2, NULL, 0, 'social', 0, 'Puntos por recibir un like'),
('comment_pin', 'Comment on Pin', 'Comentar Pin', 3, 20, 30, 'social', 2, 'Puntos por comentar'),
('receive_comment', 'Receive Comment', 'Recibir Comentario', 5, NULL, 0, 'social', 0, 'Puntos por recibir comentario'),
('share_pin', 'Share Pin', 'Compartir Pin', 5, 10, 0, 'social', 0, 'Puntos por compartir'),
-- Exploración
('visit_new_city', 'Visit New City', 'Visitar Nueva Ciudad', 50, NULL, 0, 'exploration', 25, 'Puntos por visitar ciudad nueva'),
('visit_new_state', 'Visit New State', 'Visitar Nuevo Estado', 100, NULL, 0, 'exploration', 50, 'Puntos por visitar estado nuevo'),
('first_pin_in_category', 'First Pin in Category', 'Primer Pin en Categoría', 15, NULL, 0, 'exploration', 10, 'Bonus por primer pin en una categoría'),
-- Rutas
('start_route', 'Start Route', 'Iniciar Ruta', 10, 3, 0, 'exploration', 5, 'Puntos por iniciar una ruta'),
('complete_route', 'Complete Route', 'Completar Ruta', 100, NULL, 0, 'exploration', 50, 'Puntos por completar una ruta'),
('complete_official_route', 'Complete Official Route', 'Completar Ruta Oficial', 200, NULL, 0, 'exploration', 100, 'Puntos por completar ruta oficial TRESESENTA'),
-- Especiales
('earn_badge', 'Earn Badge', 'Obtener Medalla', 50, NULL, 0, 'special', 25, 'Puntos por obtener una medalla'),
('daily_login', 'Daily Login', 'Login Diario', 5, 1, 0, 'special', 0, 'Puntos por entrar a la app cada día'),
('streak_7_days', '7 Day Streak', 'Racha de 7 días', 50, NULL, 0, 'special', 25, 'Bonus por 7 días consecutivos'),
('streak_30_days', '30 Day Streak', 'Racha de 30 días', 200, NULL, 0, 'special', 100, 'Bonus por 30 días consecutivos'),
('verified_purchase', 'Verified Purchase', 'Compra Verificada', 500, NULL, 0, 'special', 0, 'Puntos por verificar compra de TRESESENTA'),
('refer_friend', 'Refer Friend', 'Referir Amigo', 100, 5, 0, 'special', 50, 'Puntos por referir un amigo que se registre'),
('pin_featured', 'Pin Featured', 'Pin Destacado', 100, NULL, 0, 'special', 0, 'Puntos cuando tu pin es destacado por TRESESENTA');

-- ====================================
-- TABLA: point_transactions
-- Historial de puntos ganados/gastados
-- ====================================
CREATE TABLE point_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action_id INTEGER REFERENCES point_actions(id),
    points INTEGER NOT NULL,  -- Positivo = ganado, Negativo = gastado
    balance_after INTEGER NOT NULL,  -- Balance después de la transacción
    -- Contexto de la acción
    related_pin_id INTEGER REFERENCES pins(id) ON DELETE SET NULL,
    related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- Usuario relacionado (quien dio like, etc)
    related_badge_id INTEGER REFERENCES badges(id) ON DELETE SET NULL,
    related_route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
    -- Detalles
    description TEXT,
    used_tresesenta_bonus BOOLEAN DEFAULT FALSE,  -- Si se aplicó bonus de tenis
    multiplier_applied DECIMAL(3,2) DEFAULT 1.0,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- TABLA: user_daily_stats
-- Estadísticas diarias para límites y cooldowns (Página 13 del PDF)
-- ====================================
CREATE TABLE user_daily_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Contadores diarios
    pins_created INTEGER DEFAULT 0,
    photos_uploaded INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    likes_given INTEGER DEFAULT 0,
    shares_made INTEGER DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    -- Timestamps para cooldowns
    last_pin_at TIMESTAMP,
    last_comment_at TIMESTAMP,
    last_photo_at TIMESTAMP,
    -- Login streak
    login_streak INTEGER DEFAULT 0,
    last_login_date DATE,
    -- Flags de abuso
    abuse_flags INTEGER DEFAULT 0,
    is_rate_limited BOOLEAN DEFAULT FALSE,
    rate_limit_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, stat_date)
);

-- ====================================
-- TABLA: verification_requests
-- Solicitudes de verificación "Usé mis tenis Tresesenta" (Página 11 del PDF)
-- ====================================
CREATE TABLE verification_requests (
    id SERIAL PRIMARY KEY,
    pin_id INTEGER REFERENCES pins(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    -- Estado de la solicitud
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
    -- Imágenes de verificación (fotos de los tenis)
    verification_images TEXT[],
    -- Revisión por admin
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    rejection_reason VARCHAR(200),
    -- Puntos a otorgar si se aprueba
    bonus_points INTEGER DEFAULT 0,
    points_awarded BOOLEAN DEFAULT FALSE,
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- TABLA: user_routes (rutas guardadas/en progreso por usuarios)
-- ====================================
CREATE TABLE user_routes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'saved',  -- 'saved', 'in_progress', 'completed'
    pins_completed INTEGER DEFAULT 0,
    progress_percentage INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, route_id)
);

-- ====================================
-- TABLA: moderation_logs
-- Registro de acciones de moderación
-- ====================================
CREATE TABLE moderation_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,  -- 'hide_pin', 'ban_user', 'approve_verification', etc.
    target_type VARCHAR(50) NOT NULL,  -- 'pin', 'user', 'comment', 'verification'
    target_id INTEGER NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- ÍNDICES para optimización
-- ====================================
CREATE INDEX idx_pins_user ON pins(user_id);
CREATE INDEX idx_pins_category ON pins(category_id);
CREATE INDEX idx_pins_city ON pins(city_id);
CREATE INDEX idx_pins_location ON pins(latitude, longitude);
CREATE INDEX idx_pins_verification ON pins(verification_status);
CREATE INDEX idx_pins_used_tresesenta ON pins(used_tresesenta);
CREATE INDEX idx_likes_pin ON likes(pin_id);
CREATE INDEX idx_likes_user ON likes(user_id);
CREATE INDEX idx_comments_pin ON comments(pin_id);
CREATE INDEX idx_user_badges_user ON user_badges(user_id);
CREATE INDEX idx_purchases_user ON purchases(user_id);
-- Nuevos índices para sistema de puntos y verificación
CREATE INDEX idx_point_transactions_user ON point_transactions(user_id);
CREATE INDEX idx_point_transactions_date ON point_transactions(created_at);
CREATE INDEX idx_user_daily_stats_user_date ON user_daily_stats(user_id, stat_date);
CREATE INDEX idx_verification_requests_status ON verification_requests(status);
CREATE INDEX idx_verification_requests_user ON verification_requests(user_id);
CREATE INDEX idx_user_routes_user ON user_routes(user_id);
CREATE INDEX idx_user_routes_status ON user_routes(status);
CREATE INDEX idx_moderation_logs_admin ON moderation_logs(admin_id);
CREATE INDEX idx_moderation_logs_target ON moderation_logs(target_type, target_id);

-- ====================================
-- FUNCIONES Y TRIGGERS
-- ====================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pins_updated_at BEFORE UPDATE ON pins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para incrementar contador de likes en pins
CREATE OR REPLACE FUNCTION increment_pin_likes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pins SET likes_count = likes_count + 1 WHERE id = NEW.pin_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER after_like_insert AFTER INSERT ON likes
    FOR EACH ROW EXECUTE FUNCTION increment_pin_likes();

-- Función para decrementar contador de likes
CREATE OR REPLACE FUNCTION decrement_pin_likes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pins SET likes_count = likes_count - 1 WHERE id = OLD.pin_id;
    RETURN OLD;
END;
$$ language 'plpgsql';

CREATE TRIGGER after_like_delete AFTER DELETE ON likes
    FOR EACH ROW EXECUTE FUNCTION decrement_pin_likes();

-- Función para incrementar contador de comentarios
CREATE OR REPLACE FUNCTION increment_pin_comments()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pins SET comments_count = comments_count + 1 WHERE id = NEW.pin_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER after_comment_insert AFTER INSERT ON comments
    FOR EACH ROW EXECUTE FUNCTION increment_pin_comments();

-- Triggers para updated_at en nuevas tablas
CREATE TRIGGER update_badges_updated_at BEFORE UPDATE ON badges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_point_actions_updated_at BEFORE UPDATE ON point_actions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_daily_stats_updated_at BEFORE UPDATE ON user_daily_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verification_requests_updated_at BEFORE UPDATE ON verification_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_routes_updated_at BEFORE UPDATE ON user_routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- FUNCIÓN: Registrar transacción de puntos
-- ====================================
CREATE OR REPLACE FUNCTION record_point_transaction(
    p_user_id INTEGER,
    p_action_code VARCHAR(50),
    p_related_pin_id INTEGER DEFAULT NULL,
    p_related_user_id INTEGER DEFAULT NULL,
    p_used_tresesenta BOOLEAN DEFAULT FALSE,
    p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_action point_actions%ROWTYPE;
    v_points INTEGER;
    v_current_balance INTEGER;
    v_new_balance INTEGER;
    v_multiplier DECIMAL(3,2) := 1.0;
    v_is_verified_buyer BOOLEAN;
BEGIN
    -- Obtener la acción
    SELECT * INTO v_action FROM point_actions WHERE action_code = p_action_code AND is_active = TRUE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Obtener si es comprador verificado
    SELECT is_verified_buyer INTO v_is_verified_buyer FROM users WHERE id = p_user_id;
    IF v_is_verified_buyer THEN
        v_multiplier := v_action.verified_buyer_multiplier;
    END IF;

    -- Calcular puntos
    v_points := v_action.points;
    IF p_used_tresesenta THEN
        v_points := v_points + v_action.tresesenta_bonus;
    END IF;
    v_points := ROUND(v_points * v_multiplier);

    -- Obtener balance actual
    SELECT total_points INTO v_current_balance FROM users WHERE id = p_user_id;
    v_new_balance := v_current_balance + v_points;

    -- Actualizar puntos del usuario
    UPDATE users SET total_points = v_new_balance WHERE id = p_user_id;

    -- Insertar transacción
    INSERT INTO point_transactions (
        user_id, action_id, points, balance_after,
        related_pin_id, related_user_id,
        description, used_tresesenta_bonus, multiplier_applied
    ) VALUES (
        p_user_id, v_action.id, v_points, v_new_balance,
        p_related_pin_id, p_related_user_id,
        COALESCE(p_description, v_action.action_name_es),
        p_used_tresesenta, v_multiplier
    );

    RETURN v_points;
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- FUNCIÓN: Verificar límite diario
-- ====================================
CREATE OR REPLACE FUNCTION check_daily_limit(
    p_user_id INTEGER,
    p_action_type VARCHAR(50)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_stats user_daily_stats%ROWTYPE;
    v_limit INTEGER;
    v_current_count INTEGER;
BEGIN
    -- Obtener o crear stats del día
    INSERT INTO user_daily_stats (user_id, stat_date)
    VALUES (p_user_id, CURRENT_DATE)
    ON CONFLICT (user_id, stat_date) DO NOTHING;

    SELECT * INTO v_stats FROM user_daily_stats
    WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;

    -- Verificar si está rate limited
    IF v_stats.is_rate_limited AND v_stats.rate_limit_until > NOW() THEN
        RETURN FALSE;
    END IF;

    -- Obtener límite según tipo de acción
    CASE p_action_type
        WHEN 'pin' THEN
            SELECT (setting_value->>'value')::INTEGER INTO v_limit
            FROM admin_settings WHERE setting_key = 'daily_photo_limit';
            v_current_count := v_stats.pins_created;
        WHEN 'comment' THEN
            SELECT (setting_value->>'value')::INTEGER INTO v_limit
            FROM admin_settings WHERE setting_key = 'daily_comment_limit';
            v_current_count := v_stats.comments_made;
        WHEN 'like' THEN
            SELECT (setting_value->>'value')::INTEGER INTO v_limit
            FROM admin_settings WHERE setting_key = 'daily_like_limit';
            v_current_count := v_stats.likes_given;
        ELSE
            RETURN TRUE;
    END CASE;

    RETURN v_current_count < COALESCE(v_limit, 999999);
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- FUNCIÓN: Incrementar contador diario
-- ====================================
CREATE OR REPLACE FUNCTION increment_daily_stat(
    p_user_id INTEGER,
    p_stat_type VARCHAR(50)
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_daily_stats (user_id, stat_date)
    VALUES (p_user_id, CURRENT_DATE)
    ON CONFLICT (user_id, stat_date) DO NOTHING;

    CASE p_stat_type
        WHEN 'pin' THEN
            UPDATE user_daily_stats
            SET pins_created = pins_created + 1, last_pin_at = NOW()
            WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;
        WHEN 'photo' THEN
            UPDATE user_daily_stats
            SET photos_uploaded = photos_uploaded + 1, last_photo_at = NOW()
            WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;
        WHEN 'comment' THEN
            UPDATE user_daily_stats
            SET comments_made = comments_made + 1, last_comment_at = NOW()
            WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;
        WHEN 'like' THEN
            UPDATE user_daily_stats
            SET likes_given = likes_given + 1
            WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;
        WHEN 'share' THEN
            UPDATE user_daily_stats
            SET shares_made = shares_made + 1
            WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- DATOS DE PRUEBA (opcional)
-- ====================================

-- Usuario de ejemplo
INSERT INTO users (username, email, password_hash, full_name, total_points, level)
VALUES ('jorge_90', 'jorge@example.com', '$2b$10$example', 'Jorge Pérez', 250, 'Explorador Urbano');

-- Fin del schema
