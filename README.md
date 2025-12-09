# TRESESENTA MAPA360 - Backend API

API Backend completa para la plataforma TRESESENTA MAPA360.

## 🚀 Características

- Sistema de autenticación con JWT
- CRUD completo de pins (marcadores en el mapa)
- Sistema de gamificación (puntos, medallas, rankings)
- Gestión de ciudades y pasaporte de viaje
- Likes, comentarios y compartidos
- Rutas turísticas curadas
- Integración con PostgreSQL en DigitalOcean

## 📋 Requisitos

- Node.js >= 16.0.0
- npm o yarn
- PostgreSQL 14+ (ya configurado en DigitalOcean)

## 🔧 Instalación

### 1. Instalar dependencias

```bash
cd backend
npm install
```

### 2. Configurar base de datos

El archivo `.env` ya está configurado con las credenciales de DigitalOcean.

Para crear las tablas, ejecuta:

```bash
npm run db:setup
```

Este comando:
- Se conectará a tu base de datos PostgreSQL
- Creará todas las tablas necesarias
- Insertará datos iniciales (categorías, ciudades, badges)

### 3. Iniciar el servidor

**Modo desarrollo** (con auto-reload):
```bash
npm run dev
```

**Modo producción**:
```bash
npm start
```

El servidor se iniciará en `http://localhost:3000`

## 📚 Endpoints de la API

### Autenticación (`/api/auth`)

- `POST /api/auth/register` - Registro de nuevo usuario
  ```json
  {
    "username": "jorge_90",
    "email": "jorge@example.com",
    "password": "mipassword123",
    "full_name": "Jorge Pérez"
  }
  ```

- `POST /api/auth/login` - Login
  ```json
  {
    "email": "jorge@example.com",
    "password": "mipassword123"
  }
  ```

- `GET /api/auth/me` - Obtener usuario actual (requiere token)

### Pins (`/api/pins`)

- `GET /api/pins` - Listar pins (con filtros opcionales)
  - Query params: `?category=cafes&city=1&limit=20&offset=0`

- `GET /api/pins/:id` - Obtener un pin específico

- `POST /api/pins` - Crear pin (requiere token)
  ```json
  {
    "title": "Café Benito Juárez",
    "description": "Mejor café de especialidad",
    "latitude": 20.6737,
    "longitude": -103.3589,
    "category_id": 3,
    "location_name": "Guadalajara Centro",
    "city_id": 2,
    "shoe_model": "Classic White"
  }
  ```

- `POST /api/pins/:id/like` - Dar like (requiere token)
- `DELETE /api/pins/:id/like` - Quitar like (requiere token)
- `GET /api/pins/:id/comments` - Obtener comentarios
- `POST /api/pins/:id/comments` - Crear comentario (requiere token)

### Categorías (`/api/categories`)

- `GET /api/categories` - Listar todas las categorías

### Ciudades (`/api/cities`)

- `GET /api/cities` - Listar todas las ciudades
- `GET /api/cities/:id` - Obtener info de una ciudad

### Usuarios (`/api/users`)

- `GET /api/users/:username` - Obtener perfil público
- `GET /api/users/ranking/top` - Ranking de usuarios

### Badges (`/api/badges`)

- `GET /api/badges` - Listar todas las medallas
- `GET /api/badges/me` - Medallas del usuario (requiere token)

### Rutas (`/api/routes`)

- `GET /api/routes` - Listar rutas turísticas
- `GET /api/routes/:id` - Obtener una ruta con sus pins

## 🔐 Autenticación

La API usa JWT (JSON Web Tokens). Después de hacer login o registro, recibirás un token que debes incluir en el header de las peticiones protegidas:

```
Authorization: Bearer TU_TOKEN_AQUI
```

## 🎮 Sistema de Gamificación

### Puntos

- Crear pin: +20 puntos
- Dar like: +5 puntos
- Compartir: +10 puntos (implementar en frontend)

### Medallas

Las medallas se desbloquean automáticamente según logros:
- **Regional**: 3 posts del mismo estado (+150 pts)
- **Catador**: 5 cafés visitados (+200 pts)
- **Atlas**: 10 ciudades visitadas (+500 pts)
- **Leyenda**: 5000 puntos totales

## 📂 Estructura del Proyecto

```
backend/
├── config/
│   └── db.js              # Configuración PostgreSQL
├── middleware/
│   └── auth.js            # Middleware JWT
├── routes/
│   ├── auth.js            # Autenticación
│   ├── pins.js            # Pins
│   ├── users.js           # Usuarios
│   ├── categories.js      # Categorías
│   ├── cities.js          # Ciudades
│   ├── badges.js          # Medallas
│   └── routes.js          # Rutas
├── scripts/
│   └── setup-database.js  # Setup de DB
├── .env                   # Variables de entorno
├── server.js              # Servidor principal
└── package.json
```

## 🔧 Variables de Entorno

Todas las variables ya están configuradas en `.env`:

- `DB_*` - Credenciales de PostgreSQL
- `JWT_SECRET` - Secret para tokens (cambiar en producción)
- `PORT` - Puerto del servidor (default: 3000)
- `NODE_ENV` - Entorno (development/production)

## 📊 Base de Datos

### Tablas principales

- `users` - Usuarios registrados
- `pins` - Marcadores en el mapa
- `categories` - Categorías de lugares
- `cities` - Ciudades de México
- `badges` - Medallas/logros
- `routes` - Rutas turísticas
- `likes`, `comments` - Interacciones
- `user_badges`, `user_cities` - Relaciones

### Triggers automáticos

- Auto-incremento de contadores (likes, comments)
- Actualización de `updated_at`
- Cálculo de puntos

## 🚨 Troubleshooting

### Error de conexión a base de datos

Verifica que las credenciales en `.env` sean correctas y que tu IP esté permitida en DigitalOcean.

### El servidor no inicia

Asegúrate de haber instalado todas las dependencias:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Error "Cannot find module"

Verifica que todos los archivos de rutas existan en la carpeta `routes/`.

## 📝 Próximos Pasos

1. ✅ Backend API completo
2. ⏳ Implementar upload de imágenes (Cloudinary/AWS S3)
3. ⏳ Adaptar HTMLs para conectar con API
4. ⏳ Implementar integración con Instagram API
5. ⏳ Deploy en producción

## 🤝 Desarrollado por

FEREN BRANDS - 2025

---

¡La API está lista para usar! 🎉
