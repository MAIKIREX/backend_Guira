# Tabla: `public.bridge_virtual_account_events`

## Función de la Tabla
Log cronológico de cada evento emitido por Bridge relacionado con una cuenta virtual (depósitos recibidos, reversas, actualizaciones de estado). Esta tabla actúa como un registro de auditoría del ciclo de vida de las cuentas virtuales, y su contenido es la fuente de verdad para reconciliar saldos con Bridge.

**Referencia Bridge API:** Webhook events de tipo `virtual_account.*`

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID interno del evento. |
| `bridge_event_id` | `text` | UNIQUE, NOT NULL | — | ID único provisto por Bridge en el webhook. Previene duplicados. |
| `bridge_virtual_account_id` | `text` | NOT NULL | — | La cuenta virtual que fue afectada por el evento. |
| `event_type` | `text` | NOT NULL | — | Tipo de evento Bridge: `'virtual_account.funds_received'`, `'virtual_account.reversed'`. |
| `amount` | `numeric(20,6)` | nullable | NULL | Monto involucrado en el evento. |
| `currency` | `text` | nullable | NULL | Divisa del evento. |
| `sender_name` | `text` | nullable | NULL | Nombre del remitente del Wire/ACH (si disponible en el payload). |
| `sender_reference` | `text` | nullable | NULL | Referencia bancaria incluida en el wire por el remitente. |
| `raw_payload` | `jsonb` | NOT NULL | — | Payload crudo JSON completo recibido de Bridge. |
| `processed_at` | `timestamptz` | nullable | NULL | Cuando el worker procesó este evento y generó el ledger_entry. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Cuando se registró el evento. |

*RLS: Solo `service_role` puede INSERT. Staff y Admin pueden SELECT.*

## Relaciones
- **Apunta a:** `bridge_virtual_accounts` via `bridge_virtual_account_id`.
- **Genera:** `payment_orders` → `ledger_entries` cuando se procesa.

## Ejemplo JSON

```json
{
  "id": "bve11111-e89b-12d3-a456-426614174000",
  "bridge_event_id": "evt_bridge_abc789xyz",
  "bridge_virtual_account_id": "va_1a400dae-f7fc-4f75",
  "event_type": "virtual_account.funds_received",
  "amount": 5050.00,
  "currency": "usd",
  "sender_name": "Guangzhou Electronics Ltd",
  "sender_reference": "INV-2026-041-PAYMENT",
  "raw_payload": {
    "id": "evt_bridge_abc789xyz",
    "type": "virtual_account.funds_received",
    "created_at": "2026-03-26T15:29:00Z",
    "data": {
      "virtual_account_id": "va_1a400dae-f7fc-4f75",
      "amount": "5050.00",
      "currency": "usd"
    }
  },
  "processed_at": "2026-03-26T15:30:05Z",
  "created_at": "2026-03-26T15:29:30Z"
}
```
