# Tabla: `public.webhook_events`

## Función de la Tabla
`webhook_events` es la **zona de aterrizaje aislada (Webhook Sink / Inbox Pattern)** para todos los eventos HTTP enviados por proveedores externos (Bridge, Veriff, Plaid, etc.). El endpoint que recibe el POST guarda el payload crudo inmediatamente y responde HTTP 200, sin procesar nada. Un worker asíncrono lee la cola, verifica la firma HMAC del proveedor, procesa cada evento y actualiza las tablas operacionales. Este patrón garantiza que **ningún evento se pierde**, incluso si el sistema está bajo carga o momentáneamente inaccesible.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID interno del evento webhook. |
| `provider` | `text` | NOT NULL, CHECK | — | Proveedor que envió el evento: `'bridge'`, `'veriff'`, `'plaid'`, `'internal'`. |
| `event_type` | `text` | NOT NULL | — | Tipo de evento tal como lo envió el proveedor (ej. `'transfer.complete'`, `'virtual_account.funds_received'`, `'kyc_link.approved'`, `'liquidation_address.payment_completed'`). |
| `provider_event_id` | `text` | UNIQUE, nullable | NULL | ID único del evento provisto por el proveedor. Previene procesamiento duplicado. |
| `raw_payload` | `jsonb` | NOT NULL | — | Payload JSON completo tal como llegó del proveedor. No se modifica. |
| `headers` | `jsonb` | nullable | `'{}'` | Headers relevantes del request (contiene la firma HMAC del proveedor para verificación). |
| **`signature_verified`** | `boolean` | NOT NULL | `false` | Indica si la firma HMAC del webhook fue verificada exitosamente antes de procesar. Se establece en `true` por el worker antes de ejecutar la lógica. |
| `status` | `text` | NOT NULL, CHECK | `'pending'` | Estado de procesamiento: `'pending'`, `'processing'`, `'processed'`, `'failed'`, `'ignored'`. |
| `retry_count` | `integer` | NOT NULL | `0` | Número de reintentos del worker al procesar este evento. |
| `last_error` | `text` | nullable | NULL | Último mensaje de error si el worker falló al procesar. |
| **`bridge_api_version`** | `text` | nullable | NULL | Versión de la API de Bridge del evento (del header `Bridge-Api-Version`). Ayuda a detectar cambios de schema en el payload. |
| `received_at` | `timestamptz` | NOT NULL | `now()` | Timestamp exacto de recepción del webhook. |
| `processing_started_at` | `timestamptz` | nullable | NULL | Cuando el worker comenzó a procesar este evento. |
| `processed_at` | `timestamptz` | nullable | NULL | Cuando el worker terminó de procesar exitosamente. |

*RLS: Solo `service_role` puede INSERT y UPDATE. Admin puede SELECT para debugging.*

## Lógica de Procesamiento del Worker

```
CRON cada 30 segundos:
  SELECT * FROM webhook_events 
  WHERE status = 'pending' 
    AND retry_count < 5
  ORDER BY received_at ASC
  LIMIT 50

  Para cada evento:
    1. Verificar firma HMAC de Bridge → UPDATE signature_verified = true (o descartar)
    2. UPDATE webhook_events SET status = 'processing'
    
    CASE event_type:
      'virtual_account.funds_received'        → payment_order + ledger_entry + UPDATE balances
      'transfer.payment_processed'            → UPDATE bridge_transfers.bridge_state
      'transfer.complete'                     → UPDATE bridge_transfers + ledger_entry + certificate + UPDATE balances
      'transfer.failed'                       → ledger_entry reversal + UPDATE balances + notificar cliente
      'kyc_link.approved'                     → UPDATE kyc_applications.status + profiles.bridge_customer_id
      'kyb_link.approved'                     → UPDATE kyb_applications.status + profiles.onboarding_status
      'liquidation_address.payment_completed' → ledger_entry deposit + UPDATE balances + notificar cliente
    
    Si ok:  UPDATE SET status = 'processed', processed_at = NOW()
    Si falla: UPDATE SET status = 'failed',
                         retry_count = retry_count + 1,
                         last_error = error_message
              (si retry_count >= 5: alertar al Admin via notifications)
```

## Relaciones
No tiene FK directas (es un sink desacoplado). El worker usa su contenido para afectar: `payment_orders`, `bridge_transfers`, `ledger_entries`, `balances`, `kyc_applications`, `kyb_applications`, `notifications`, `certificates`.

## Ejemplo JSON — Webhook Recibido

```json
{
  "id": "whe11111-e89b-12d3-a456-426614174000",
  "provider": "bridge",
  "event_type": "virtual_account.funds_received",
  "provider_event_id": "evt_bridge_abc789xyz",
  "raw_payload": {
    "id": "evt_bridge_abc789xyz",
    "type": "virtual_account.funds_received",
    "created_at": "2026-03-26T15:29:00Z",
    "data": {
      "virtual_account_id": "va_1a400dae",
      "amount": "5050.00",
      "currency": "usd",
      "sender_name": "Guangzhou Electronics Ltd",
      "deposit_message": "INV-2026-GZ-041"
    }
  },
  "headers": {
    "x-bridge-signature": "sha256=abc123...",
    "bridge-api-version": "2025-07-04"
  },
  "signature_verified": true,
  "bridge_api_version": "2025-07-04",
  "status": "processed",
  "retry_count": 0,
  "last_error": null,
  "received_at": "2026-03-26T15:29:30Z",
  "processing_started_at": "2026-03-26T15:30:00Z",
  "processed_at": "2026-03-26T15:30:05Z"
}
```
