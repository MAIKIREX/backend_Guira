# Tabla: `public.bridge_transfers`

## Función de la Tabla
`bridge_transfers` es el registro histórico de cada transferencia de fondos ejecutada a través de Bridge API. Cada solicitud de pago (payout) que va al mundo bancario real pasa por Bridge y genera un registro aquí. La tabla captura todos los campos clave de la respuesta de Bridge — incluyendo el `receipt` completo y el `destination_tx_hash` — para garantizar trazabilidad total, reconciliación y recuperación ante errores.

**Referencia Bridge API:** `POST /v0/transfers`  
**Campos clave de Bridge:** `on_behalf_of`, `source`, `destination`, `developer_fee`, `developer_fee_percent`, `idempotency_key`, `receipt`.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID interno de la plataforma. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente en cuyo nombre se ejecutó (`on_behalf_of`). |
| `payout_request_id` | `uuid` | nullable, FK → `payout_requests.id` | NULL | Payout request que originó esta transferencia. |
| `bridge_transfer_id` | `text` | UNIQUE, NOT NULL | — | ID provisto por Bridge (ej. `trans_abc123`). |
| `idempotency_key` | `text` | UNIQUE, NOT NULL | — | Clave enviada a Bridge para prevenir doble ejecución. |
| `transfer_kind` | `text` | NOT NULL | — | Naturaleza: `'fiat_to_fiat'`, `'crypto_to_fiat'`, `'fiat_to_crypto'`, `'crypto_to_crypto'`. |
| `business_purpose` | `text` | NOT NULL | — | Razón comercial requerida por AML (ej. `'Supplier payment'`). |
| `source_payment_rail` | `text` | NOT NULL | — | Rail de origen: `'usdc'`, `'ach'`, `'wire'`, `'sepa'`. |
| `source_currency` | `text` | NOT NULL | — | Moneda de origen. |
| `source_type` | `text` | NOT NULL | — | Tipo de origen: `'bridge_wallet'`, `'external_account'`, `'crypto_wallet'`. |
| `source_id` | `text` | nullable | NULL | ID del objeto origen en Bridge. |
| `destination_payment_rail` | `text` | NOT NULL | — | Rail de destino: `'ach'`, `'wire'`, `'sepa'`, `'ethereum'`, `'solana'`, `'polygon'`. |
| `destination_currency` | `text` | NOT NULL | — | Moneda de destino. |
| `destination_type` | `text` | NOT NULL | — | Tipo de destino: `'external_account'`, `'crypto_wallet'`. |
| `destination_id` | `text` | nullable | NULL | ID del objeto destino en Bridge. |
| `amount` | `numeric(20,6)` | NOT NULL, CHECK > 0 | — | Monto bruto enviado. |
| `developer_fee_amount` | `numeric(20,6)` | NOT NULL | `0` | Fee del desarrollador (valor fijo). |
| `developer_fee_percent` | `numeric(10,4)` | nullable | NULL | Porcentaje del fee enviado a Bridge. |
| `net_amount` | `numeric(20,6)` | nullable | NULL | Monto neto que llegó al beneficiario. |
| **`bridge_state`** | `text` | NOT NULL, CHECK | `'awaiting_funds'` | Estado real devuelto por Bridge: `'awaiting_funds'`, `'payment_processed'`, `'complete'`, `'failed'`, `'reversed'`. |
| `status` | `text` | NOT NULL, CHECK | `'pending'` | Estado interno: `'pending'`, `'processing'`, `'completed'`, `'failed'`, `'reversed'`. |
| **`source_deposit_instructions`** | `jsonb` | nullable | NULL | Instrucciones de depósito devueltas por Bridge. Mostradas al cliente cuando `bridge_state = 'awaiting_funds'`. |
| **`deposit_message`** | `text` | nullable | NULL | Mensaje de referencia obligatorio que el cliente debe incluir al enviar fondos (requerido por Bridge). |
| **`receipt_initial_amount`** | `numeric(20,6)` | nullable | NULL | Del `receipt` de Bridge: monto inicial recibido. |
| **`receipt_exchange_fee`** | `numeric(20,6)` | nullable | NULL | Del `receipt` de Bridge: fee de cambio de divisa aplicado. |
| **`receipt_developer_fee`** | `numeric(20,6)` | nullable | NULL | Del `receipt` de Bridge: fee del desarrollador cobrado. |
| **`receipt_final_amount`** | `numeric(20,6)` | nullable | NULL | Del `receipt` de Bridge: monto final entregado al beneficiario. |
| **`destination_tx_hash`** | `text` | nullable | NULL | Hash de la transacción blockchain destino (si la transferencia es a crypto). Ej. `0xc0ffee...` |
| **`exchange_rate`** | `numeric(18,8)` | nullable | NULL | Tasa de cambio aplicada al momento de la transferencia (ej. USD/USDC). Crítico para auditoría. |
| **`exchange_rate_at`** | `timestamptz` | nullable | NULL | Momento en que Bridge capturó la tasa de cambio. |
| `bridge_raw_response` | `jsonb` | nullable | NULL | Respuesta completa JSON de Bridge para debugging. |
| `completed_at` | `timestamptz` | nullable | NULL | Fecha de confirmación final de Bridge. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última actualización de estado. |

*RLS: El cliente ve sus propias transferencias. Staff y Admin ven todas.*

## Relaciones
- **Pertenece a:** `profiles` y `payout_requests`.
- **Referenciada por:** `ledger_entries` via `bridge_transfer_id`.
- **Genera:** `certificates` cuando `bridge_state = 'complete'`.

## Estados de Bridge (bridge_state)

```
awaiting_funds → payment_processed → complete
             ↘                    → failed → (reversed si aplica)
```

## Ejemplo JSON

```json
{
  "id": "btr11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "payout_request_id": "pay11111-e89b-12d3-a456-426614174000",
  "bridge_transfer_id": "trans_def456ghi",
  "idempotency_key": "idm_pay11111_20260326",
  "transfer_kind": "crypto_to_fiat",
  "business_purpose": "Supplier payment — INV-2026-041",
  "source_payment_rail": "usdc",
  "source_currency": "usdc",
  "source_type": "bridge_wallet",
  "source_id": "bwallet_guira_main",
  "destination_payment_rail": "wire",
  "destination_currency": "usd",
  "destination_type": "external_account",
  "destination_id": "ext_acct_xyz987abc",
  "amount": 10000.00,
  "developer_fee_amount": 25.00,
  "developer_fee_percent": 0.25,
  "net_amount": 9975.00,
  "bridge_state": "complete",
  "status": "completed",
  "source_deposit_instructions": null,
  "deposit_message": null,
  "receipt_initial_amount": 10000.00,
  "receipt_exchange_fee": 0.00,
  "receipt_developer_fee": 25.00,
  "receipt_final_amount": 9975.00,
  "destination_tx_hash": null,
  "exchange_rate": 1.00000000,
  "exchange_rate_at": "2026-03-26T16:00:00Z",
  "completed_at": "2026-03-26T18:00:00Z",
  "created_at": "2026-03-26T16:01:00Z",
  "updated_at": "2026-03-26T18:00:00Z"
}
```

### Ejemplo con Transfer Fiat → Crypto (awaiting_funds)

```json
{
  "bridge_transfer_id": "transfer_123",
  "bridge_state": "awaiting_funds",
  "source_payment_rail": "ach_push",
  "source_currency": "usd",
  "destination_payment_rail": "ethereum",
  "destination_currency": "usdc",
  "source_deposit_instructions": {
    "bank_account_number": "123456789",
    "bank_routing_number": "101019644",
    "amount": "10.0",
    "currency": "usd",
    "deposit_message": "BVI7depositmessage"
  },
  "deposit_message": "BVI7depositmessage",
  "receipt_initial_amount": null,
  "destination_tx_hash": null
}
```
