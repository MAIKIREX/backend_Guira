# 02 — Profiles (Perfiles de Usuario)

> **Prefijo Usuario:** `/profiles`  
> **Prefijo Admin:** `/admin/profiles`

---

## Endpoints de Usuario

### `GET /profiles/me` — Mi perfil
**Auth:** ✅ Bearer Token

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "Juan Pérez",
  "phone": "+59177712345",
  "avatar_url": "https://storage.../avatar.jpg",
  "role": "client",
  "onboarding_status": "approved",
  "is_active": true,
  "is_frozen": false,
  "frozen_reason": null,
  "bridge_customer_id": "bridge_abc123",
  "account_type": "individual",
  "transaction_limits": {
    "daily_limit": 10000,
    "monthly_limit": 50000,
    "per_transaction_limit": 5000
  },
  "created_at": "2026-01-01T00:00:00Z"
}
```

**Datos a mostrar en pantalla:**
- Nombre completo, email, teléfono
- Avatar (con opción de cambiar)
- Rol (badge visual distinto para admin)
- Estado de onboarding (badge: pending/in_review/approved/rejected)
- Estado de cuenta (activa/congelada con razón)
- Límites de transacción

---

### `PATCH /profiles/me` — Actualizar mi perfil
**Auth:** ✅ Bearer Token

**Request Body (parcial):**
```json
{
  "full_name": "Juan Alberto Pérez",
  "phone": "+59177799999",
  "avatar_url": "https://storage.../new-avatar.jpg"
}
```

**Response 200:** Perfil actualizado (misma estructura que GET)

**Notas Frontend:**
- Solo se pueden modificar: `full_name`, `phone`, `avatar_url`
- No se puede cambiar email ni rol desde aquí

---

### `GET /profiles/me/onboarding-status` — Estado de onboarding resumido
**Auth:** ✅ Bearer Token

**Response 200:**
```json
{
  "onboarding_status": "approved",
  "account_type": "individual",
  "bridge_customer_id": "bridge_abc123",
  "has_wallet": true,
  "has_kyc": true,
  "kyc_status": "approved",
  "has_kyb": false,
  "kyb_status": null,
  "tos_accepted": true
}
```

**Notas Frontend:**
- Usar para determinar qué pasos del onboarding faltan
- Mostrar checklist visual: ✅ KYC enviado, ⏳ En revisión, etc.

---

### `GET /profiles/me/avatar-upload-url?fileName=avatar.jpg` — URL firmada para avatar
**Auth:** ✅ Bearer Token

**Query Params:**
| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fileName` | string | ✅ | Nombre del archivo con extensión |

**Response 200:**
```json
{
  "upload_url": "https://storage.supabase.co/...",
  "public_url": "https://storage.../avatars/uuid/avatar.jpg",
  "expires_in": 3600
}
```

**Notas Frontend:**
1. Llamar a este endpoint para obtener la URL firmada
2. Hacer `PUT` directo al `upload_url` con el binario de la imagen
3. Actualizar el perfil con `PATCH /profiles/me` usando `public_url` como `avatar_url`

---

## Endpoints Admin

### `GET /admin/profiles` — Listar todos los perfiles
**Auth:** ✅ Bearer Token | **Roles:** staff, admin, super_admin

**Query Params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | 1 | Página |
| `limit` | number | 20 | Items por página (máx 100) |
| `role` | string | — | Filtro: `client`, `staff`, `admin`, `super_admin` |
| `onboarding_status` | string | — | Filtro: `pending`, `in_review`, `approved`, `rejected` |
| `is_frozen` | boolean | — | Solo cuentas congeladas |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "...",
      "full_name": "...",
      "role": "client",
      "onboarding_status": "approved",
      "is_active": true,
      "is_frozen": false,
      "created_at": "..."
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

### `GET /admin/profiles/:id` — Ver perfil completo de un usuario
**Auth:** ✅ | **Roles:** staff+

---

### `PATCH /admin/profiles/:id/freeze` — Congelar/Descongelar cuenta
**Auth:** ✅ | **Roles:** admin, super_admin

**Request Body:**
```json
{
  "freeze": true,
  "reason": "Actividad sospechosa detectada por compliance"
}
```

**Notas Frontend:**
- Al congelar, el usuario no podrá crear órdenes ni realizar transacciones
- Mostrar confirmación modal antes de ejecutar

---

### `PATCH /admin/profiles/:id/activate` — Activar/Desactivar cuenta
**Auth:** ✅ | **Roles:** admin, super_admin

**Request Body:**
```json
{
  "is_active": false
}
```
