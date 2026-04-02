# 10 — Admin Panel (Settings, Audit Logs, Reconciliación, Proveedores)

---

## Settings (Configuración)

> **Prefijo público:** `/settings`  
> **Prefijo admin:** `/admin/settings`

### `GET /settings/public` — Configuración pública
**Auth:** ❌ Público

**Response 200:**
```json
{
  "MIN_INTERBANK_USD": "10.00",
  "MAX_INTERBANK_USD": "50000.00",
  "MIN_RAMP_USD": "5.00",
  "MAX_RAMP_USD": "25000.00",
  "APP_VERSION": "1.0.0",
  "MAINTENANCE_MODE": "false"
}
```

**Notas Frontend:**
- Cargar al inicio de la app para validaciones en formularios
- Usar para mostrar límites al usuario
- Verificar `MAINTENANCE_MODE` para mostrar pantalla de mantenimiento

---

### `GET /admin/settings` — Todos los settings
**Roles:** admin, super_admin

**Response 200:**
```json
[
  {
    "key": "MAX_PAYMENT_ORDERS_PER_HOUR",
    "value": "5",
    "type": "number",
    "description": "Máximo de órdenes de pago por hora por usuario",
    "is_public": false
  },
  {
    "key": "PSAV_REVIEW_THRESHOLD",
    "value": "1000.00",
    "type": "number",
    "description": "Monto desde el cual órdenes PSAV requieren revisión extra",
    "is_public": false
  }
]
```

---

### `POST /admin/settings` — Crear setting
**Roles:** super_admin

```json
{
  "key": "NEW_FEATURE_FLAG",
  "value": "true",
  "type": "boolean",
  "description": "Feature flag para nueva funcionalidad",
  "is_public": false
}
```

### `PATCH /admin/settings/:key` — Actualizar setting
**Roles:** super_admin

```json
{
  "value": "10",
  "description": "Actualizado el límite por hora"
}
```

---

## Activity (Feed de Actividad)

### `GET /activity` — Mi actividad reciente
**Auth:** ✅ Bearer Token

**Query Params:**
| Param | Tipo | Default |
|-------|------|---------|
| `limit` | number | 50 |

**Response 200:**
```json
[
  {
    "id": "uuid",
    "action": "payment_order_created",
    "description": "Creaste orden interbancaria #PO-123 por 1000 BOB",
    "metadata": { "order_id": "uuid" },
    "created_at": "2026-01-15T10:30:00Z"
  },
  {
    "id": "uuid",
    "action": "kyc_submitted",
    "description": "Enviaste tu expediente KYC para revisión",
    "created_at": "2026-01-10T08:00:00Z"
  }
]
```

**Notas Frontend:**
- Mostrar como timeline en el dashboard
- Cada entry puede tener un link a la entidad relacionada

---

## Audit Logs (Admin)

### `GET /admin/audit-logs` — Historial de auditoría
**Roles:** staff, admin, super_admin

**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `performed_by` | uuid | Actor que realizó la acción |
| `action` | string | Tipo de acción |
| `table_name` | string | Tabla afectada |
| `page` | number | Página |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "performed_by": "uuid",
      "performer_name": "Ana Admin",
      "action": "approve_review",
      "table_name": "compliance_reviews",
      "record_id": "uuid",
      "previous_values": { "status": "open" },
      "new_values": { "status": "approved" },
      "ip_address": "192.168.1.1",
      "created_at": "..."
    }
  ],
  "total": 500,
  "page": 1
}
```

---

### `GET /admin/audit-logs/user/:userId` — Auditoría por usuario

### `GET /admin/activity/:userId` — Actividad de un cliente (vista staff)

---

## Reconciliación Financiera (Admin)

### `POST /admin/reconciliation/run` — Ejecutar reconciliación manual
**Roles:** admin, super_admin

**Response 200:**
```json
{
  "id": "uuid",
  "status": "completed",
  "total_checked": 150,
  "discrepancies_found": 2,
  "started_at": "...",
  "completed_at": "..."
}
```

---

### `GET /admin/reconciliation` — Historial de reconciliaciones
**Query:** `?page=1`

### `GET /admin/reconciliation/:id` — Detalle con discrepancias

**Response 200:**
```json
{
  "id": "uuid",
  "status": "completed",
  "total_checked": 150,
  "discrepancies": [
    {
      "type": "balance_mismatch",
      "wallet_id": "uuid",
      "expected_balance": "1500.00",
      "actual_balance": "1490.00",
      "difference": "10.00",
      "description": "Diferencia de 10 USDC en wallet de usuario Juan Pérez"
    }
  ]
}
```

---

## Suppliers (Proveedores del usuario)

> **Prefijo:** `/suppliers`  
> **Auth:** ✅ Bearer Token

### `POST /suppliers` — Crear proveedor
```json
{
  "name": "Proveedor Tech SRL",
  "tax_id": "NIT-87654321",
  "email": "contacto@provtech.com",
  "phone": "+59122233344",
  "bank_name": "Banco Mercantil",
  "account_number": "9876543210",
  "account_holder": "Proveedor Tech SRL",
  "currency": "bob",
  "notes": "Proveedor de servicios IT"
}
```

### `GET /suppliers` — Listar proveedores activos
**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Proveedor Tech SRL",
    "bank_name": "Banco Mercantil",
    "account_number_last4": "3210",
    "currency": "bob",
    "created_at": "..."
  }
]
```

### `GET /suppliers/:id` — Detalle
### `PATCH /suppliers/:id` — Actualizar
### `DELETE /suppliers/:id` — Desactivar

**Notas Frontend:**
- CRUD completo de proveedores
- Selectable en formularios de payment orders como destino rápido
- Mostrar solo los del usuario autenticado

---

## Pantallas Admin Requeridas

| Pantalla | Ruta | Roles | Descripción |
|----------|------|-------|-------------|
| Dashboard admin | `/admin` | staff+ | Resumen con stats |
| Settings | `/admin/settings` | admin+ | CRUD de settings |
| Audit logs | `/admin/audit-logs` | staff+ | Tabla de auditoría |
| Actividad usuario | `/admin/users/:id/activity` | staff+ | Timeline del cliente |
| Reconciliación | `/admin/reconciliation` | admin+ | Historial + ejecutar |
| Detalle reconciliación | `/admin/reconciliation/:id` | admin+ | Discrepancias |

## Pantallas Cliente

| Pantalla | Ruta | Descripción |
|----------|------|-------------|
| Mi actividad | `/activity` | Timeline de actividades recientes |
| Proveedores | `/suppliers` | CRUD de proveedores |
