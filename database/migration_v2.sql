-- ====================================
-- MIGRACIÓN V2 - Sistema de Puntos y Verificación TRESESENTA
-- Ejecutar en base de datos existente
-- ====================================

-- Agregar campos a users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_color VARCHAR(20) DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_verified_buyer BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Agregar campos a pins
ALTER TABLE pins
ADD COLUMN IF NOT EXISTS used_tresesenta BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS verification_notes TEXT,
ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- Agregar campos a badges
ALTER TABLE badges
ADD COLUMN IF NOT EXISTS points_reward INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS geographic_scope VARCHAR(50) DEFAULT 'national',
ADD COLUMN IF NOT EXISTS scope_value VARCHAR(100),
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS rarity VARCHAR(20) DEFAULT 'common',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ====================================
-- Nuevas tablas
-- ====================================

-- Configuración admin
CREATE TABLE IF NOT EXISTS admin_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50),
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
('max_points_per_day', '{"value": 500}', 'Máximo de puntos que se pueden ganar por día', 'points')
ON CONFLICT (setting_key) DO NOTHING;

-- Acciones de puntos
CREATE TABLE IF NOT EXISTS point_actions (
    id SERIAL PRIMARY KEY,
    action_code VARCHAR(50) UNIQUE NOT NULL,
    action_name VARCHAR(100) NOT NULL,
    action_name_es VARCHAR(100) NOT NULL,
    description TEXT,
    points INTEGER NOT NULL DEFAULT 0,
    daily_limit INTEGER,
    cooldown_seconds INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    requires_verification BOOLEAN DEFAULT FALSE,
    category VARCHAR(50),
    verified_buyer_multiplier DECIMAL(3,2) DEFAULT 1.0,
    tresesenta_bonus INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar acciones de puntos
INSERT INTO point_actions (action_code, action_name, action_name_es, points, daily_limit, cooldown_seconds, category, tresesenta_bonus, description) VALUES
('create_pin', 'Create Pin', 'Crear Pin', 20, 5, 60, 'content', 10, 'Puntos por crear un nuevo pin'),
('create_pin_with_photo', 'Create Pin with Photo', 'Crear Pin con Foto', 25, 5, 60, 'content', 15, 'Puntos por crear pin con foto'),
('create_pin_with_video', 'Create Pin with Video', 'Crear Pin con Video', 30, 3, 120, 'content', 20, 'Puntos por crear pin con video'),
('add_photo_to_pin', 'Add Photo', 'Agregar Foto', 5, 10, 30, 'content', 5, 'Puntos por agregar foto a pin existente'),
('like_pin', 'Like Pin', 'Dar Like', 1, 50, 0, 'social', 0, 'Puntos por dar like'),
('receive_like', 'Receive Like', 'Recibir Like', 2, NULL, 0, 'social', 0, 'Puntos por recibir un like'),
('comment_pin', 'Comment on Pin', 'Comentar Pin', 3, 20, 30, 'social', 2, 'Puntos por comentar'),
('receive_comment', 'Receive Comment', 'Recibir Comentario', 5, NULL, 0, 'social', 0, 'Puntos por recibir comentario'),
('share_pin', 'Share Pin', 'Compartir Pin', 5, 10, 0, 'social', 0, 'Puntos por compartir'),
('visit_new_city', 'Visit New City', 'Visitar Nueva Ciudad', 50, NULL, 0, 'exploration', 25, 'Puntos por visitar ciudad nueva'),
('visit_new_state', 'Visit New State', 'Visitar Nuevo Estado', 100, NULL, 0, 'exploration', 50, 'Puntos por visitar estado nuevo'),
('first_pin_in_category', 'First Pin in Category', 'Primer Pin en Categoría', 15, NULL, 0, 'exploration', 10, 'Bonus por primer pin en una categoría'),
('start_route', 'Start Route', 'Iniciar Ruta', 10, 3, 0, 'exploration', 5, 'Puntos por iniciar una ruta'),
('complete_route', 'Complete Route', 'Completar Ruta', 100, NULL, 0, 'exploration', 50, 'Puntos por completar una ruta'),
('complete_official_route', 'Complete Official Route', 'Completar Ruta Oficial', 200, NULL, 0, 'exploration', 100, 'Puntos por completar ruta oficial TRESESENTA'),
('earn_badge', 'Earn Badge', 'Obtener Medalla', 50, NULL, 0, 'special', 25, 'Puntos por obtener una medalla'),
('daily_login', 'Daily Login', 'Login Diario', 5, 1, 0, 'special', 0, 'Puntos por entrar a la app cada día'),
('streak_7_days', '7 Day Streak', 'Racha de 7 días', 50, NULL, 0, 'special', 25, 'Bonus por 7 días consecutivos'),
('streak_30_days', '30 Day Streak', 'Racha de 30 días', 200, NULL, 0, 'special', 100, 'Bonus por 30 días consecutivos'),
('verified_purchase', 'Verified Purchase', 'Compra Verificada', 500, NULL, 0, 'special', 0, 'Puntos por verificar compra de TRESESENTA'),
('refer_friend', 'Refer Friend', 'Referir Amigo', 100, 5, 0, 'special', 50, 'Puntos por referir un amigo que se registre'),
('pin_featured', 'Pin Featured', 'Pin Destacado', 100, NULL, 0, 'special', 0, 'Puntos cuando tu pin es destacado por TRESESENTA')
ON CONFLICT (action_code) DO NOTHING;

-- Transacciones de puntos
CREATE TABLE IF NOT EXISTS point_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action_id INTEGER REFERENCES point_actions(id),
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    related_pin_id INTEGER REFERENCES pins(id) ON DELETE SET NULL,
    related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    related_badge_id INTEGER REFERENCES badges(id) ON DELETE SET NULL,
    related_route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
    description TEXT,
    used_tresesenta_bonus BOOLEAN DEFAULT FALSE,
    multiplier_applied DECIMAL(3,2) DEFAULT 1.0,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Estadísticas diarias de usuario
CREATE TABLE IF NOT EXISTS user_daily_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    pins_created INTEGER DEFAULT 0,
    photos_uploaded INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    likes_given INTEGER DEFAULT 0,
    shares_made INTEGER DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    last_pin_at TIMESTAMP,
    last_comment_at TIMESTAMP,
    last_photo_at TIMESTAMP,
    login_streak INTEGER DEFAULT 0,
    last_login_date DATE,
    abuse_flags INTEGER DEFAULT 0,
    is_rate_limited BOOLEAN DEFAULT FALSE,
    rate_limit_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, stat_date)
);

-- Solicitudes de verificación
CREATE TABLE IF NOT EXISTS verification_requests (
    id SERIAL PRIMARY KEY,
    pin_id INTEGER REFERENCES pins(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    verification_images TEXT[],
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    rejection_reason VARCHAR(200),
    bonus_points INTEGER DEFAULT 0,
    points_awarded BOOLEAN DEFAULT FALSE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rutas de usuario
CREATE TABLE IF NOT EXISTS user_routes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'saved',
    pins_completed INTEGER DEFAULT 0,
    progress_percentage INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, route_id)
);

-- Logs de moderación
CREATE TABLE IF NOT EXISTS moderation_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- Índices
-- ====================================
CREATE INDEX IF NOT EXISTS idx_pins_verification ON pins(verification_status);
CREATE INDEX IF NOT EXISTS idx_pins_used_tresesenta ON pins(used_tresesenta);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_date ON point_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_user_daily_stats_user_date ON user_daily_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_routes_user ON user_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_routes_status ON user_routes(status);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_admin ON moderation_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_target ON moderation_logs(target_type, target_id);

-- ====================================
-- Funciones
-- ====================================

-- Función para registrar transacción de puntos
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
    SELECT * INTO v_action FROM point_actions WHERE action_code = p_action_code AND is_active = TRUE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    SELECT is_verified_buyer INTO v_is_verified_buyer FROM users WHERE id = p_user_id;
    IF v_is_verified_buyer THEN
        v_multiplier := v_action.verified_buyer_multiplier;
    END IF;

    v_points := v_action.points;
    IF p_used_tresesenta THEN
        v_points := v_points + v_action.tresesenta_bonus;
    END IF;
    v_points := ROUND(v_points * v_multiplier);

    SELECT total_points INTO v_current_balance FROM users WHERE id = p_user_id;
    v_new_balance := v_current_balance + v_points;

    UPDATE users SET total_points = v_new_balance WHERE id = p_user_id;

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

-- Función para verificar límite diario
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
    INSERT INTO user_daily_stats (user_id, stat_date)
    VALUES (p_user_id, CURRENT_DATE)
    ON CONFLICT (user_id, stat_date) DO NOTHING;

    SELECT * INTO v_stats FROM user_daily_stats
    WHERE user_id = p_user_id AND stat_date = CURRENT_DATE;

    IF v_stats.is_rate_limited AND v_stats.rate_limit_until > NOW() THEN
        RETURN FALSE;
    END IF;

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

-- Función para incrementar contador diario
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

-- Mensaje de éxito
DO $$
BEGIN
    RAISE NOTICE 'Migración V2 completada exitosamente';
END $$;
