-- ====================================
-- TRESESENTA MAPA360 - Database Schema
-- PostgreSQL
-- ====================================

-- Eliminar tablas si existen (para desarrollo)
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

-- Insertar categorías predefinidas
INSERT INTO categories (name, name_es, emoji, color, description) VALUES
('monuments', 'Monumentos', '🏛️', '#e74c3c', 'Sitios históricos y monumentos'),
('nature', 'Naturaleza', '🌳', '#27ae60', 'Parques, bosques y naturaleza'),
('cafes', 'Cafés', '☕', '#f39c12', 'Cafeterías y lugares para café'),
('nightlife', 'Nightlife', '🍷', '#9b59b6', 'Bares, restaurantes y vida nocturna'),
('museums', 'Museos', '🎨', '#3498db', 'Museos y galerías'),
('curious', 'Curiosos', '✨', '#e91e63', 'Lugares únicos y curiosos');

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
-- ====================================
CREATE TABLE badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_es VARCHAR(100) NOT NULL,
    description TEXT,
    emoji VARCHAR(10),
    points_required INTEGER,
    condition_type VARCHAR(50), -- 'posts_in_state', 'complete_route', 'total_posts', etc.
    condition_value JSONB, -- Datos adicionales de la condición
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar badges predefinidos
INSERT INTO badges (name, name_es, description, emoji, points_required, condition_type, condition_value) VALUES
('regional', 'Regional', 'Publica 3 posts del mismo estado', '🏆', 150, 'posts_in_state', '{"posts": 3}'),
('coffee_lover', 'Catador', 'Visita 5 cafés diferentes', '☕', 200, 'category_count', '{"category": "cafes", "count": 5}'),
('nature_explorer', 'Raíces', 'Explora 5 lugares de naturaleza', '🌿', 200, 'category_count', '{"category": "nature", "count": 5}'),
('art_collector', 'Artista', 'Visita 3 museos', '🎨', 150, 'category_count', '{"category": "museums", "count": 3}'),
('foodie', 'Foodie', 'Publica 10 lugares de comida/nightlife', '🌮', 300, 'mixed_category', '{"categories": ["nightlife", "cafes"], "count": 10}'),
('night_owl', 'Nocturno', 'Visita 5 lugares de nightlife', '🌙', 200, 'category_count', '{"category": "nightlife", "count": 5}'),
('atlas', 'Atlas', 'Visita 10 ciudades diferentes', '🗺️', 500, 'cities_visited', '{"count": 10}'),
('global', 'Global', 'Visita 15 ciudades diferentes', '🌍', 800, 'cities_visited', '{"count": 15}'),
('legend', 'Leyenda', 'Alcanza 5000 puntos', '👑', 5000, 'total_points', '{"points": 5000}');

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
-- ÍNDICES para optimización
-- ====================================
CREATE INDEX idx_pins_user ON pins(user_id);
CREATE INDEX idx_pins_category ON pins(category_id);
CREATE INDEX idx_pins_city ON pins(city_id);
CREATE INDEX idx_pins_location ON pins(latitude, longitude);
CREATE INDEX idx_likes_pin ON likes(pin_id);
CREATE INDEX idx_likes_user ON likes(user_id);
CREATE INDEX idx_comments_pin ON comments(pin_id);
CREATE INDEX idx_user_badges_user ON user_badges(user_id);
CREATE INDEX idx_purchases_user ON purchases(user_id);

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

-- ====================================
-- DATOS DE PRUEBA (opcional)
-- ====================================

-- Usuario de ejemplo
INSERT INTO users (username, email, password_hash, full_name, total_points, level)
VALUES ('jorge_90', 'jorge@example.com', '$2b$10$example', 'Jorge Pérez', 250, 'Explorador Urbano');

-- Fin del schema
