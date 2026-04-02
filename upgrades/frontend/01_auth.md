# 01 — Auth (Autenticación)

> **Prefijo:** `/auth`  
> **Guard:** Público para registro/refresh, autenticado para me/logout

---

## Endpoints

### `POST /auth/register` — Registrar usuario
**Auth:** ❌ Público (rate limited)

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "full_name": "Juan Pérez",
  "phone": "+59177712345"
}
```

**Response 201:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "session": {
    "access_token": "eyJhbGci...",
    "refresh_token": "abc123...",
    "expires_in": 3600,
    "token_type": "bearer"
  }
}
```

**Errores:**
- `409` — Email ya registrado
- `429` — Demasiados intentos (rate limit)

**Notas Frontend:**
- Al registrarse, el trigger de DB crea automáticamente un `profile` con `role=client` y `onboarding_status=pending`
- Guardar `access_token` y `refresh_token` en almacenamiento seguro
- Después del registro, redirigir al flujo de onboarding

---

### `GET /auth/me` — Obtener usuario autenticado
**Auth:** ✅ Bearer Token

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "profile": {
    "full_name": "Juan Pérez",
    "phone": "+59177712345",
    "role": "client",
    "onboarding_status": "pending",
    "is_active": true,
    "is_frozen": false,
    "avatar_url": null,
    "bridge_customer_id": null,
    "transaction_limits": {}
  }
}
```

**Notas Frontend:**
- Usar este endpoint al inicio de la app para determinar:
  - Si el usuario completó onboarding (`onboarding_status`)
  - Si la cuenta está congelada (`is_frozen`)
  - El rol del usuario para mostrar UI admin o cliente

---

### `POST /auth/refresh` — Renovar token
**Auth:** ❌ Público (rate limited)

**Request Body:**
```json
{
  "refresh_token": "abc123..."
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGci...(nuevo)",
  "refresh_token": "def456...(nuevo)",
  "expires_in": 3600
}
```

**Notas Frontend:**
- Implementar interceptor HTTP que detecte `401` y automáticamente intente refresh
- Si el refresh falla, enviar al login

---

### `POST /auth/logout` — Cerrar sesión
**Auth:** ✅ Bearer Token

**Response 200:**
```json
{ "message": "Sesión cerrada" }
```

**Notas Frontend:**
- Limpiar tokens del almacenamiento local
- Redirigir a pantalla de login

---

### `POST /auth/forgot-password` — Solicitar restablecimiento de contraseña
**Auth:** ❌ Público (rate limited)

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response 200:**
```json
{
  "message": "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña."
}
```

**Notas Frontend:**
- El usuario recibirá un correo electrónico con un magic link (`type=recovery`)
- Configurar en la terminal (`.env`): `FRONTEND_URL` para asegurar que el link referencie bien al frontend (e.g. `https://miapp.com/auth/reset-password`)
- Supabase redirigirá al usuario al frontend adjuntando el `access_token` temporal en el Fragment (hash `#`) de la URL
- No mostrar errores como "El correo no existe" por motivos de seguridad; asume siempre un envío exitoso

---

### `POST /auth/reset-password` — Establecer la nueva contraseña
**Auth:** ✅ Bearer Token (Proporcionado por AuthRecovery)

**Request Body:**
```json
{
  "new_password": "NewSecurePass123!"
}
```

**Response 200:**
```json
{
  "message": "Contraseña actualizada exitosamente"
}
```

**Notas Frontend (Manejo del Full Flow de Recuperación):**
1. Supabase te redirige a tu app: `https://miapp.com/auth/reset-password#access_token=eyJhb...&refresh_token=...&type=recovery`
2. **Importante:** Tu frontend debe capturar ese `access_token` del fragment de la URL antes de mostrar el formulario y establecerlo temporalmente en tus headers de Autorización
3. Muestra el formulario con el campo `new_password`
4. Al hacer POST a `/auth/reset-password` usa el token capturado.
5. Después del success, es recomendable forzar un `/auth/logout` o redirigir al `/login` a menos que quieras renovar los tokens.
