# 09 — Notifications y Support (Notificaciones y Soporte)

---

## Notifications

> **Prefijo:** `/notifications`  
> **Auth:** ✅ Bearer Token

### `GET /notifications` — Listar notificaciones

**Query Params:**
| Param | Tipo | Default |
|-------|------|---------|
| `page` | number | 1 |
| `limit` | number | 20 |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "payment_order_completed",
      "title": "Orden completada",
      "body": "Tu orden #PO-2026-001 de 1000 BOB → USD fue entregada exitosamente.",
      "is_read": false,
      "metadata": {
        "order_id": "uuid",
        "flow_type": "bolivia_to_world"
      },
      "created_at": "2026-01-15T10:30:00Z"
    },
    {
      "id": "uuid",
      "type": "kyc_approved",
      "title": "KYC Aprobado",
      "body": "Tu verificación de identidad fue aprobada. Ya puedes operar.",
      "is_read": true,
      "metadata": {},
      "created_at": "2026-01-10T08:00:00Z"
    }
  ],
  "total": 25,
  "page": 1
}
```

**Datos a mostrar:**
- Lista con ícono por tipo de notificación
- Indicador de no leída (punto azul)
- Counter en campana del header
- Click navega según `metadata` (ej: a la orden de pago)

---

### `GET /notifications/unread-count` — Cantidad no leídas

**Response 200:**
```json
{ "count": 5 }
```

**Notas Frontend:**
- Llamar periódicamente (polling cada 30s) o usar Supabase Realtime
- Actualizar badge del ícono de campana

---

### `PATCH /notifications/read-all` — Marcar todas como leídas

**Response 200:**
```json
{ "updated": 5 }
```

---

### `PATCH /notifications/:id/read` — Marcar una como leída

---

## Pantallas Frontend — Notifications

| Pantalla | Descripción |
|----------|-------------|
| Dropdown notificaciones | Campana en header → dropdown con las últimas 10 |
| Todas las notificaciones | `/notifications` — Lista paginada completa |

---

## Support (Tickets de Soporte)

> **Prefijo Usuario:** `/support/tickets`  
> **Prefijo Admin:** `/admin/support/tickets`

### `POST /support/tickets` — Crear ticket
**Auth:** ✅ Bearer Token

**Request Body:**
```json
{
  "subject": "Error en transferencia",
  "category": "payment_issue",
  "description": "Realicé una transferencia hace 3 días y aún no se refleja...",
  "priority": "high",
  "related_order_id": "uuid-opcional"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "ticket_number": "TK-2026-0042",
  "subject": "Error en transferencia",
  "status": "open",
  "priority": "high",
  "created_at": "..."
}
```

---

### `GET /support/tickets` — Listar mis tickets

**Response 200:**
```json
[
  {
    "id": "uuid",
    "ticket_number": "TK-2026-0042",
    "subject": "Error en transferencia",
    "status": "open",
    "priority": "high",
    "assigned_to": null,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

### `GET /support/tickets/:id` — Detalle de ticket

**Response 200:**
```json
{
  "id": "uuid",
  "ticket_number": "TK-2026-0042",
  "subject": "Error en transferencia",
  "description": "...",
  "status": "in_progress",
  "priority": "high",
  "assigned_to": {
    "id": "uuid",
    "name": "Ana Soporte"
  },
  "messages": [
    { "author": "user", "body": "Descripción original...", "created_at": "..." },
    { "author": "staff", "body": "Estamos verificando...", "created_at": "..." }
  ],
  "related_order_id": "uuid",
  "created_at": "...",
  "resolved_at": null
}
```

---

## Support — Endpoints Admin

### `GET /admin/support/tickets` — Listar todos los tickets
**Roles:** staff, admin, super_admin

**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | `open`, `in_progress`, `resolved`, `closed` |
| `assigned_to` | uuid | Filtrar por agente |
| `page` | number | Página |

---

### `PATCH /admin/support/tickets/:id/assign` — Asignar ticket
```json
{ "staff_user_id": "uuid" }
```

### `PATCH /admin/support/tickets/:id/status` — Cambiar estado
```json
{ "status": "in_progress" }
```

### `PATCH /admin/support/tickets/:id/resolve` — Resolver ticket
```json
{
  "resolution": "Se verificó depósito y fue acreditado manualmente.",
  "resolution_type": "resolved"
}
```

---

## Pantallas Frontend — Support

| Pantalla | Actor | Descripción |
|----------|-------|-------------|
| Crear ticket | Cliente | Form con subject, categoría, descripción |
| Mis tickets | Cliente | Lista con estados |
| Detalle ticket | Cliente | Chat/timeline de mensajes |
| Cola de tickets | Admin | Tabla con filtros, asignación |
| Detalle admin | Admin | Vista completa + acciones |
