# Sistema de Autenticación JWT

## Resumen

El sistema implementa autenticación mediante JSON Web Tokens (JWT) con roles de usuario para controlar accesos a diferentes secciones de la aplicación.

## Roles de Usuario

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `espectador` | Usuario general | Comprar entradas, ver su perfil |
| `premium` | Usuario premium | (a definir) |
| `boleteria` | Personal de venta | Acceso a panel de boletería |
| `productor` | Gestor de espectáculos | Gestionar sus propios shows |
| `admin` | Administrador | Acceso total al sistema |

## Backend

### Endpoints de Autenticación

#### POST `/api/auth/register`
Registra un nuevo usuario.

**Body:**
```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "password": "password123",
  "role": "espectador"  // opcional, default: espectador
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "role": "espectador"
  }
}
```

#### POST `/api/auth/login`
Inicia sesión con credenciales.

**Body:**
```json
{
  "email": "juan@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "role": "espectador"
  }
}
```

#### GET `/api/auth/me`
Obtiene información del usuario actual.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "role": "espectador",
  "createdAt": "2025-10-30T12:00:00Z"
}
```

#### POST `/api/auth/logout`
Cierra sesión (solo logging, token se invalida client-side).

### Middleware

#### `authenticateToken`
Verifica que el request incluya un JWT válido. Añade `req.user` con datos del token.

**Uso:**
```javascript
import { authenticateToken } from '../middleware/auth.js';

router.get('/protected', authenticateToken, (req, res) => {
  // req.user = { userId, email, role, name }
  res.json({ message: 'Acceso permitido' });
});
```

#### `requireRole(...allowedRoles)`
Verifica que el usuario tenga uno de los roles especificados.

**Uso:**
```javascript
import { authenticateToken, requireRole } from '../middleware/auth.js';

router.get('/admin', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({ message: 'Panel de administración' });
});

router.get('/staff', authenticateToken, requireRole('boleteria', 'admin'), (req, res) => {
  res.json({ message: 'Panel de personal' });
});
```

#### `optionalAuth`
Añade `req.user` si hay token, pero no falla si no lo hay. Útil para rutas que funcionan con o sin autenticación.

**Uso:**
```javascript
import { optionalAuth } from '../middleware/auth.js';

router.post('/reservations', optionalAuth, (req, res) => {
  // req.user puede ser null o { userId, email, role, name }
  const user_id = req.user?.userId || req.body.user_id;
  // ...
});
```

### Variables de Entorno

```env
JWT_SECRET=tu_secret_key_aqui
JWT_EXPIRES_IN=7d
```

## Frontend

### AuthContext

Proporciona estado global de autenticación.

**Uso:**
```javascript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, token, isAuthenticated, login, logout } = useAuth();
  
  return (
    <div>
      {isAuthenticated ? (
        <>
          <p>Hola, {user.name}</p>
          <button onClick={logout}>Cerrar sesión</button>
        </>
      ) : (
        <button onClick={() => navigate('/login')}>Iniciar sesión</button>
      )}
    </div>
  );
}
```

**Propiedades:**
- `user`: Objeto con datos del usuario actual (id, name, email, role)
- `token`: JWT actual
- `loading`: Boolean, true mientras carga datos del usuario
- `isAuthenticated`: Boolean, true si hay usuario autenticado
- `login(email, password)`: Función async para login
- `register(name, email, password)`: Función async para registro
- `logout()`: Función para cerrar sesión

### Rutas Protegidas

#### ProtectedRoute Component

Protege rutas que requieren autenticación.

**Uso:**
```javascript
import ProtectedRoute from '../components/ProtectedRoute';

<Route path="/perfil" element={
  <ProtectedRoute>
    <Perfil />
  </ProtectedRoute>
} />

// Con restricción de rol
<Route path="/admin" element={
  <ProtectedRoute allowedRoles={['admin']}>
    <Admin />
  </ProtectedRoute>
} />
```

### Enviar Requests Autenticados

**Ejemplo:**
```javascript
const { token } = useAuth();

const headers = {
  'Content-Type': 'application/json'
};

if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}

const res = await fetch('http://localhost:4000/api/some-endpoint', {
  method: 'POST',
  headers,
  body: JSON.stringify({ data: 'example' })
});
```

## Flujo de Autenticación

### Registro
1. Usuario completa formulario en `/register`
2. Frontend envía POST a `/api/auth/register`
3. Backend:
   - Valida datos
   - Hashea contraseña con bcrypt
   - Crea usuario en DB
   - Genera JWT
4. Frontend recibe token y lo guarda en localStorage
5. AuthContext carga usuario automáticamente
6. Redirección a cartelera

### Login
1. Usuario completa formulario en `/login`
2. Frontend envía POST a `/api/auth/login`
3. Backend:
   - Busca usuario por email
   - Verifica contraseña con bcrypt
   - Genera JWT
4. Frontend recibe token y lo guarda en localStorage
5. AuthContext carga usuario automáticamente
6. Redirección a cartelera

### Acceso a Ruta Protegida
1. Usuario intenta acceder a `/perfil`
2. ProtectedRoute verifica autenticación
3. Si no hay user:
   - Redirección a `/login`
4. Si hay user pero rol incorrecto:
   - Muestra mensaje de acceso denegado
5. Si hay user y rol correcto:
   - Renderiza componente

### Request a API Protegida
1. Frontend prepara request con Authorization header
2. Backend recibe request
3. Middleware `authenticateToken` verifica JWT
4. Si token válido:
   - Extrae userId, email, role, name
   - Añade a `req.user`
   - Continúa a siguiente middleware
5. Si token inválido/expirado:
   - Retorna 401 o 403
6. Middleware `requireRole` verifica rol si aplica
7. Handler procesa request con `req.user` disponible

## Seguridad

- **Contraseñas**: Hasheadas con bcrypt (10 rounds)
- **JWT**: Firmado con secret, expira en 7 días
- **Email**: Único en base de datos
- **Roles**: Validados en backend, nunca confiar en frontend
- **HTTPS**: Requerido en producción para proteger tokens

## Migración del Sistema Anterior

El sistema anterior usaba `localStorage.getItem('user_id')` para simular usuarios. La migración incluye:

1. **Detalle.jsx**: Verifica autenticación antes de permitir reservas
2. **MpSuccess.jsx**: Usa JWT en confirmación de pago
3. **Perfil.jsx**: Obtiene datos de usuario del JWT
4. **Backend**: Rutas aceptan JWT con fallback a headers/body para compatibilidad
5. **Cleanup**: `localStorage.user_id` se elimina al hacer logout

## Próximos Pasos

- [ ] Refresh tokens para sesiones largas
- [ ] Recuperación de contraseña por email
- [ ] OAuth con Google/Facebook
- [ ] Rate limiting en endpoints de auth
- [ ] Audit log de accesos
