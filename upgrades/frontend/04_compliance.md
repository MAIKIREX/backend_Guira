# 04 — Compliance (Documentos, Reviews, Límites)

> **Prefijo Usuario:** `/compliance`  
> **Prefijo Admin:** `/admin/compliance` + `/admin/users`

---

## Endpoints de Usuario

### `POST /compliance/documents/upload-url` — URL firmada para subir documento
**Auth:** ✅ Bearer Token

**Request Body:**
```json
{
  "file_name": "cedula_frontal.jpg",
  "document_type": "national_id",
  "subject_type": "person",
  "subject_id": "uuid-opcional"
}
```

**Response 200:**
```json
{
  "upload_url": "https://storage.supabase.co/...",
  "storage_path": "compliance/uuid/national_id/cedula_frontal.jpg"
}
```

---

### `POST /compliance/documents` — Registrar documento ya subido
**Request Body:**
```json
{
  "document_type": "national_id",
  "subject_type": "person",
  "storage_path": "compliance/uuid/national_id/cedula_frontal.jpg",
  "file_name": "cedula_frontal.jpg",
  "mime_type": "image/jpeg"
}
```

---

### `GET /compliance/documents` — Listar mis documentos
**Query:** `?subject_type=person`

---

### `GET /compliance/kyc` — Estado de mi KYC
**Response 200:**
```json
{
  "id": "uuid",
  "status": "approved",
  "submitted_at": "...",
  "approved_at": "...",
  "bridge_kyc_link_id": "..."
}
```

---

### `GET /compliance/kyb` — Estado de mi KYB
Similar a KYC pero para empresa.

---

### `GET /compliance/reviews` — Mis revisiones de compliance
**Response 200:**
```json
[
  {
    "id": "uuid",
    "subject_type": "kyc_application",
    "status": "approved",
    "reviewer_name": "Ana Admin",
    "comments": [],
    "created_at": "..."
  }
]
```

---

## Endpoints Admin — Compliance

### `GET /admin/compliance/reviews` — Listar reviews pendientes
**Roles:** staff, admin, super_admin

**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `priority` | string | `normal`, `high`, `urgent` |
| `assigned_to` | uuid | Filtrar por analista asignado |

**Response 200:**
```json
[
  {
    "id": "uuid",
    "subject_type": "kyc_application",
    "subject_id": "uuid",
    "user_id": "uuid",
    "user_name": "Juan Pérez",
    "user_email": "juan@example.com",
    "status": "open",
    "priority": "normal",
    "assigned_to": null,
    "created_at": "..."
  }
]
```

**Datos para pantalla Admin:**
- Tabla con reviews pendientes
- Filtros por prioridad y analista
- Badge de prioridad (normal/high/urgent)
- Botones: Asignar, Ver detalle

---

### `GET /admin/compliance/reviews/:id` — Detalle de review
**Response 200:**
```json
{
  "id": "uuid",
  "subject_type": "kyc_application",
  "subject_id": "uuid",
  "user_profile": { "full_name": "...", "email": "..." },
  "documents": [...],
  "comments": [
    { "id": "uuid", "author": "Ana Admin", "body": "Documento ilegible", "is_internal": true }
  ],
  "history": [
    { "action": "review_created", "actor": "system", "timestamp": "..." }
  ]
}
```

---

### `PATCH /admin/compliance/reviews/:id/assign` — Asignar review
```json
{ "staff_user_id": "uuid-del-analista" }
```

### `PATCH /admin/compliance/reviews/:id/escalate` — Escalar a urgente

### `POST /admin/compliance/reviews/:id/comments` — Agregar comentario
```json
{
  "body": "El documento de identidad está borroso, solicitar nueva foto",
  "is_internal": true
}
```

### `POST /admin/compliance/reviews/:id/approve` — Aprobar
```json
{ "reason": "Documentación completa y verificada" }
```

**Efecto:** Cambia `onboarding_status` a `approved`, crea wallet automáticamente.

### `POST /admin/compliance/reviews/:id/reject` — Rechazar
```json
{ "reason": "Documentos no coinciden con la información proporcionada" }
```

### `POST /admin/compliance/reviews/:id/request-changes` — Solicitar correcciones
```json
{
  "reason": "Documento de identidad ilegible",
  "required_actions": ["Subir nueva foto de cédula frontal y posterior"]
}
```

---

## Límites de Transacción

### `POST /admin/users/:id/limits` — Establecer límites personalizados
**Roles:** admin, super_admin

```json
{
  "daily_limit": 25000,
  "monthly_limit": 100000,
  "per_transaction_limit": 10000
}
```

---

## Pantallas Admin Requeridas

| Pantalla | Ruta sugerida | Descripción |
|----------|---------------|-------------|
| Cola de reviews | `/admin/compliance` | Lista con filtros, badges prioridad |
| Detalle review | `/admin/compliance/:id` | Datos usuario, documentos, historial, acciones |
| Gestión límites | `/admin/users/:id/limits` | Configurar límites por usuario |
