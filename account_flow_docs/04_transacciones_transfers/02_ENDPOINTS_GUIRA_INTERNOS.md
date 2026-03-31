# Endpoints Guira — API Interna para Transacciones

> **Descripción:** Todos los endpoints que el frontend/app consume directamente para gestionar payouts y transfers.
> **Base URL:** `https://api.guira.app/v1`
> **Autenticación:** `Authorization: Bearer <access_token>` (JWT Supabase)

---

## 📋 Resumen de Endpoints

| Método | Endpoint | Descripción | Rol |
|:---:|:---|:---|:---:|
| `POST` | `/bridge/payouts` | Crear un nuevo payout (envío de dinero) | Usuario |
| `GET` | `/bridge/payouts` | Listar mis payouts/transfers | Usuario |
| `GET` | `/bridge/payouts/{id}` | Obtener detalle de un payout específico | Usuario |
| `POST` | `/admin/bridge/payouts/{id}/approve` | Aprobar payout en revisión | Admin |
| `POST` | `/admin/bridge/payouts/{id}/reject` | Rechazar payout en revisión | Admin |
| `GET` | `/admin/bridge/payouts/pending-review` | Listar payouts pendientes de revisión | Admin |

---

## 1️⃣ Crear un Payout

Envía fondos desde la wallet del usuario hacia una cuenta bancaria externa registrada.

```
POST /bridge/payouts
```

### 📥 Body Request

```json
{
  "wallet_id": "550e8400-e29b-41d4-a716-446655440000",
  "bridge_external_account_id": "660e8400-e29b-41d4-a716-446655440001",
  "amount": 500.00,
  "currency": "usd",
  "payment_rail": "ach",
  "business_purpose": "Pago a proveedor de inventario AWS",
  "notes": "Factura #INV-2993"
}
```

### Descripción de Campos del Request

| Campo | Tipo | Requerido | Descripción |
|:---|:---:|:---:|:---|
| `wallet_id` | `UUID` | ✅ | ID de la wallet de origen del usuario en Guira. |
| `bridge_external_account_id` | `UUID` | ✅ | ID de la cuenta externa destino (registrada previamente en Guira). |
| `amount` | `number` | ✅ | Monto a enviar (sin incluir la comisión; la fee se suma automáticamente). |
| `currency` | `string` | ✅ | Moneda de envío: `usd`, `eur`, `mxn`. |
| `payment_rail` | `string` | ✅ | Carril de pago: `ach`, `wire`, `sepa`, `spei`. |
| `business_purpose` | `string` | ❌ | Descripción del motivo de pago (recomendado para compliance). |
| `notes` | `string` | ❌ | Notas internas del usuario (visible solo para él). |

### 📤 Respuesta Exitosa — Auto-Aprobado (201 Created)

Cuando el monto está **por debajo** del umbral de revisión:

```json
{
  "payout_request_id": "770e8400-e29b-41d4-a716-446655440002",
  "bridge_transfer_id": "tf_abc123def456",
  "status": "processing",
  "amount": 500.00,
  "fee_amount": 2.00,
  "total_amount": 502.00,
  "currency": "usd",
  "payment_rail": "ach",
  "destination": {
    "bank_name": "Chase Bank",
    "account_last_4": "1098"
  },
  "created_at": "2026-03-31T10:00:00Z"
}
```

### 📤 Respuesta Exitosa — Requiere Revisión (201 Created)

Cuando el monto está **por encima** del umbral de revisión:

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "amount": 500.00,
  "fee_amount": 2.00,
  "total_amount": 502.00,
  "currency": "usd",
  "payment_rail": "ach",
  "status": "pending",
  "requires_review": true,
  "message": "Tu pago está siendo revisado por nuestro equipo de compliance. Recibirás una notificación cuando sea procesado.",
  "created_at": "2026-03-31T10:00:00Z"
}
```

### 🚫 Posibles Errores

| HTTP | Error | Causa |
|:---:|:---|:---|
| `400` | `Saldo insuficiente` | `available_amount` no cubre `amount + fee`. |
| `400` | `Límite de transferencia excedido` | El monto supera los límites KYC/KYB del usuario en `transaction_limits`. |
| `400` | `Cuenta externa no encontrada` | El `bridge_external_account_id` no existe o está desactivada. |
| `400` | `Payment rail no soportado` | El carril no es compatible con la moneda o el destino. |
| `403` | `Cuenta congelada` | La cuenta del usuario fue congelada por compliance. |
| `403` | `Onboarding incompleto` | El usuario no ha sido aprobado aún. |
| `500` | `Error al reservar saldo` | Falla en el stored procedure `reserve_balance`. |

---

## 2️⃣ Listar Mis Payouts

Obtiene el historial de payouts del usuario autenticado.

```
GET /bridge/payouts
```

### Query Parameters (Opcionales)

| Parámetro | Tipo | Descripción |
|:---|:---:|:---|
| `status` | `string` | Filtrar por estado: `pending`, `processing`, `completed`, `failed`, `cancelled`. |
| `page` | `number` | Número de página (default: 1). |
| `limit` | `number` | Registros por página (default: 10, max: 50). |
| `date_from` | `string` | Fecha mínima ISO 8601. |
| `date_to` | `string` | Fecha máxima ISO 8601. |

### 📤 Respuesta (200 OK)

```json
{
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "bridge_transfer_id": "tf_abc123def456",
      "amount": 500.00,
      "fee_amount": 2.00,
      "total_amount": 502.00,
      "currency": "usd",
      "payment_rail": "ach",
      "status": "completed",
      "destination": {
        "bank_name": "Chase Bank",
        "account_last_4": "1098"
      },
      "business_purpose": "Pago a proveedor de inventario AWS",
      "created_at": "2026-03-31T10:00:00Z",
      "settled_at": "2026-04-02T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "total_pages": 1
  }
}
```

---

## 3️⃣ Obtener Detalle de un Payout

Consulta la información completa de un payout individual, incluyendo el estado actualizado desde Bridge.

```
GET /bridge/payouts/{id}
```

### Path Parameters

| Parámetro | Tipo | Descripción |
|:---|:---:|:---|
| `id` | `UUID` | ID del payout request en Guira. |

### 📤 Respuesta (200 OK)

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "bridge_transfer_id": "tf_abc123def456",
  "wallet_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 500.00,
  "fee_amount": 2.00,
  "total_amount": 502.00,
  "currency": "usd",
  "payment_rail": "ach",
  "status": "processing",
  "bridge_state": "payment_submitted",
  "destination": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "bank_name": "Chase Bank",
    "account_name": "Empresa LLC",
    "account_last_4": "1098",
    "payment_rail": "ach"
  },
  "receipt": {
    "initial_amount": "500.00",
    "developer_fee": "2.00",
    "exchange_fee": "0.00",
    "gas_fee": "0.10",
    "final_amount": "497.90",
    "receipt_url": "https://dashboard.bridge.xyz/transaction/.../receipt/..."
  },
  "business_purpose": "Pago a proveedor de inventario AWS",
  "notes": "Factura #INV-2993",
  "requires_review": false,
  "created_at": "2026-03-31T10:00:00Z",
  "updated_at": "2026-03-31T10:05:00Z"
}
```

---

## 4️⃣ Aprobar un Payout (Solo Admin)

Aprueba un payout que fue retenido por superar el umbral de revisión.

```
POST /admin/bridge/payouts/{id}/approve
```

### 📥 Body Request (Opcional)

```json
{
  "admin_notes": "Revisión AML completada. Beneficiario verificado."
}
```

### 📤 Respuesta (200 OK)

```json
{
  "payout_request_id": "770e8400-e29b-41d4-a716-446655440002",
  "bridge_transfer_id": "tf_abc123def456",
  "status": "processing",
  "approved_by": "admin-user-uuid",
  "approved_at": "2026-03-31T11:00:00Z"
}
```

---

## 5️⃣ Rechazar un Payout (Solo Admin)

Rechaza un payout retenido. El saldo reservado regresa automáticamente al `available_amount` del usuario.

```
POST /admin/bridge/payouts/{id}/reject
```

### 📥 Body Request

```json
{
  "reason": "Indicios de fraude detectados en el beneficiario según AML DB."
}
```

### 📤 Respuesta (200 OK)

```json
{
  "payout_request_id": "770e8400-e29b-41d4-a716-446655440002",
  "status": "cancelled",
  "reason": "Indicios de fraude detectados en el beneficiario según AML DB.",
  "balance_restored": true,
  "rejected_by": "admin-user-uuid",
  "rejected_at": "2026-03-31T11:30:00Z"
}
```

> **Nota:** Al rechazar, se ejecuta `.rpc('release_reserved_balance')` que devuelve atómicamente el monto de `reserved_amount` → `available_amount`.

---

## 6️⃣ Listar Payouts Pendientes de Revisión (Solo Admin)

Obtiene todos los payouts que requieren aprobación manual.

```
GET /admin/bridge/payouts/pending-review
```

### 📤 Respuesta (200 OK)

```json
{
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "user_id": "user-uuid",
      "user_email": "maria@ejemplo.com",
      "amount": 5000.00,
      "fee_amount": 10.00,
      "total_amount": 5010.00,
      "currency": "usd",
      "payment_rail": "wire",
      "destination_bank": "Chase Bank",
      "business_purpose": "Compra de equipos",
      "created_at": "2026-03-31T10:00:00Z",
      "compliance_review_id": "review-uuid"
    }
  ],
  "count": 1
}
```
