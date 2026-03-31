# Webhooks de Transfers — Eventos Bridge → Guira

> **Descripción:** Eventos webhook que Bridge envía a Guira durante el ciclo de vida de un transfer. Se explica qué payload llega, cómo se procesa y qué acciones ejecuta el backend.
> **Módulo:** `WebhooksService` → `POST /webhooks/bridge`

---

## 🏗️ Arquitectura de Procesamiento de Webhooks

```
┌──────────┐        ┌───────────────┐        ┌────────────────┐
│  BRIDGE  │──POST──│  /webhooks/   │──INSERT─│ webhook_events │
│  (API)   │        │    bridge     │         │ status=pending │
└──────────┘        └───────┬───────┘         └───────┬────────┘
                            │                         │
                       200 OK                    CRON Worker
                    (respuesta                   cada 30 seg
                     inmediata)                       │
                                              ┌──────▼─────────┐
                                              │ Verifica HMAC  │
                                              │ SHA-256 firma  │
                                              └──────┬─────────┘
                                                     │
                                              ┌──────▼─────────┐
                                              │ Dispatch según │
                                              │  event_type    │
                                              └──────┬─────────┘
                                                     │
                            ┌────────────────────────┼──────────────────┐
                            │                        │                  │
                   transfer.updated        transfer.payment     transfer.returned
                                           _processed
```

---

## 📨 Eventos de Transfers

### 1. `transfer.updated`

Se dispara cada vez que un transfer cambia de estado. Es el evento más frecuente.

```json
{
  "event_type": "transfer.updated",
  "id": "evt_transfer_001",
  "data": {
    "id": "tf_abc123-uuid-del-transfer",
    "state": "funds_received",
    "on_behalf_of": "cust_123456789",
    "amount": "500.00",
    "currency": "usd",
    "developer_fee": "2.00",
    "source": {
      "payment_rail": "ethereum",
      "currency": "usdc"
    },
    "destination": {
      "payment_rail": "ach",
      "currency": "usd",
      "external_account_id": "ea_987654321"
    },
    "receipt": {
      "initial_amount": "500.00",
      "developer_fee": "2.00",
      "exchange_fee": "0.00",
      "subtotal_amount": "498.00",
      "gas_fee": "0.10",
      "final_amount": "497.90"
    },
    "created_at": "2026-03-31T10:00:00.000Z",
    "updated_at": "2026-03-31T10:05:00.000Z"
  }
}
```

#### Proceso Interno de Guira (`handleTransferUpdated`)

```
handleTransferUpdated(payload)
│
├── 1. Localizar bridge_transfers por data.id
│
├── 2. Actualizar bridge_transfers.status → data.state
│
├── 3. Switch según data.state:
│     │
│     ├── "funds_received"
│     │     └── Log: "Bridge recibió los fondos"
│     │         (sin acción contable)
│     │
│     ├── "payment_submitted"
│     │     └── Notificación push: "Tu pago fue enviado al banco destino"
│     │         (sin acción contable)
│     │
│     ├── "payment_processed" ← ✅ LIQUIDACIÓN
│     │     └── handleTransferCompleted()
│     │
│     ├── "returned" | "error" ← ❌ FALLO
│     │     └── handleTransferFailed()
│     │
│     ├── "refunded" ← ↩️ DEVOLUCIÓN
│     │     └── handleTransferRefunded()
│     │
│     └── otros estados → Log informativo
│
└── 4. Marcar webhook_events.status → 'processed'
```

---

### 2. `transfer.payment_processed` (Éxito Final)

Es el evento más importante. Confirma que el dinero llegó al destinatario.

```json
{
  "event_type": "transfer.payment_processed",
  "id": "evt_transfer_002",
  "data": {
    "id": "tf_abc123-uuid-del-transfer",
    "state": "payment_processed",
    "amount": "500.00",
    "currency": "usd",
    "receipt": {
      "initial_amount": "500.00",
      "developer_fee": "2.00",
      "exchange_fee": "0.00",
      "subtotal_amount": "498.00",
      "gas_fee": "0.10",
      "final_amount": "497.90",
      "url": "https://dashboard.bridge.xyz/transaction/xxx/receipt/yyy"
    },
    "updated_at": "2026-04-02T14:30:00.000Z"
  }
}
```

#### Proceso Interno: `handleTransferCompleted()`

| Paso | Tabla | Acción | SQL Equivalente |
|:---:|:---|:---|:---|
| 1 | `bridge_transfers` | Status → `payment_processed` | `UPDATE bridge_transfers SET status = 'payment_processed' WHERE bridge_transfer_id = ?` |
| 2 | `ledger_entries` | Status `pending` → `settled` | `UPDATE ledger_entries SET status = 'settled' WHERE bridge_transfer_id = ?` |
| 3 | `balances` | **Trigger DB**: `reserved_amount` se resta automáticamente | Trigger PostgreSQL se activa al cambiar ledger a `settled` |
| 4 | `payout_requests` | Status → `completed` | `UPDATE payout_requests SET status = 'completed' WHERE bridge_transfer_id = ?` |
| 5 | `certificates` | Genera certificado transaccional | `INSERT INTO certificates (number, type, ...) VALUES ('CERT-2026-XXX', 'PAYOUT', ...)` |
| 6 | `notifications` | Push al usuario | `INSERT INTO notifications (user_id, title, body, ...) VALUES (?, 'Pago Completado', 'Tu pago de $500 USD fue procesado', ...)` |
| 7 | `activity_logs` | Log de actividad | `INSERT INTO activity_logs (user_id, action, ...) VALUES (?, 'PAYOUT_COMPLETED', ...)` |

---

### 3. `transfer.returned` / `transfer.error` (Fallo)

El banco destino rechazó el pago o hubo un error técnico.

```json
{
  "event_type": "transfer.updated",
  "id": "evt_transfer_003",
  "data": {
    "id": "tf_abc123-uuid-del-transfer",
    "state": "returned",
    "return_details": {
      "reason": "Account closed",
      "code": "R02"
    },
    "updated_at": "2026-04-03T08:00:00.000Z"
  }
}
```

#### Proceso Interno: `handleTransferFailed()`

| Paso | Tabla | Acción |
|:---:|:---|:---|
| 1 | `bridge_transfers` | Status → `returned` / `error` |
| 2 | `ledger_entries` | Status `pending` → `failed` |
| 3 | `balances` | Ejecuta `.rpc('release_reserved_balance')`: devuelve `reserved_amount` → `available_amount` |
| 4 | `payout_requests` | Status → `failed` |
| 5 | `notifications` | Push: *"Tu pago fue rechazado por el banco destino. El saldo ha sido devuelto a tu wallet."* |
| 6 | `activity_logs` | `PAYOUT_FAILED` con motivo del rechazo |

**Estado del Balance Tras Fallo:**
```
ANTES:  available = $498.00  |  reserved = $502.00
DESPUÉS: available = $1,000.00 |  reserved = $0.00
         (el dinero regresó íntegramente)
```

---

### 4. `transfer.refunded` (Devolución Completada)

Cuando Bridge devuelve exitosamente los fondos al source después de un problema no resuelto.

```json
{
  "event_type": "transfer.updated",
  "id": "evt_transfer_004",
  "data": {
    "id": "tf_abc123-uuid-del-transfer",
    "state": "refunded",
    "updated_at": "2026-04-04T10:00:00.000Z"
  }
}
```

#### Proceso: `handleTransferRefunded()`

Misma lógica que `handleTransferFailed()`, pero con:
- Ledger status → `refunded` (en vez de `failed`).
- Activity log → `PAYOUT_REFUNDED`.
- Notificación diferente: *"Los fondos de tu pago fueron devueltos a tu wallet."*

---

## 🛡️ Seguridad de Webhooks

### Verificación HMAC SHA-256

Cada webhook de Bridge incluye un header de firma:

```http
x-bridge-signature: sha256=a3b9c1d2e3f4...
```

Guira valida la firma así:

```typescript
const expectedSignature = crypto
  .createHmac('sha256', BRIDGE_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');

if (receivedSignature !== `sha256=${expectedSignature}`) {
  throw new UnauthorizedException('Firma de webhook inválida');
}
```

### Idempotencia

- Cada webhook tiene un `id` de evento único (ej. `evt_transfer_001`).
- Bridge puede reenviar el mismo evento si no recibe `200 OK` a tiempo.
- Guira almacena el `bridge_event_id` en `webhook_events` con constraint `UNIQUE`.
- Si el evento ya fue procesado, se ignora silenciosamente.

---

## 📊 Resumen de Eventos por Estado

| Evento Webhook | Estado `data.state` | Acción Contable | Acción Balance |
|:---|:---|:---|:---|
| `transfer.updated` | `funds_received` | Ninguna | Ninguna |
| `transfer.updated` | `payment_submitted` | Ninguna | Ninguna |
| `transfer.payment_processed` | `payment_processed` | Ledger → `settled` | `reserved` → $0 (trigger DB) |
| `transfer.updated` | `returned` | Ledger → `failed` | `reserved` → `available` |
| `transfer.updated` | `error` | Ledger → `failed` | `reserved` → `available` |
| `transfer.updated` | `refunded` | Ledger → `refunded` | `reserved` → `available` |
| `transfer.updated` | `canceled` | Ledger → `cancelled` | `reserved` → `available` |
