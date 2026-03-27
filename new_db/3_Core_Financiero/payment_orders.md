# Tabla: `public.payment_orders`

## Función de la Tabla
`payment_orders` representa cada depósito confirmado en la plataforma, independientemente de la vía de entrada (Wire/ACH/SEPA/SPEI/PIX/Crypto). Cuando el sistema confirma que el dinero llegó (vía webhook de Bridge), se crea una `payment_order` como registro estructurado del depósito antes de generar el `ledger_entry` correspondiente. Incluye datos del remitente y la tasa de cambio para trazabilidad completa.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único de la orden. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Destinatario del depósito. |
| `wallet_id` | `uuid` | NOT NULL, FK → `wallets.id` | — | Wallet que recibirá los fondos acreditados. |
| `payin_route_id` | `uuid` | nullable, FK → `payin_routes.id` | NULL | Vía de pago por la que llegó el dinero. |
| `source_type` | `text` | NOT NULL | — | Origen: `'bridge_virtual_account'`, `'crypto_wallet'`, `'manual'`, `'liquidation_address'`. |
| `source_reference_id` | `text` | nullable | NULL | ID del objeto origen en Bridge (ej. `va_abc123` o `liq_addr_xyz`). |
| `amount` | `numeric(20,6)` | NOT NULL, CHECK > 0 | — | Monto bruto recibido en la divisa origen. |
| `fee_amount` | `numeric(20,6)` | NOT NULL | `0` | Comisión deducida (developer fee de Bridge). |
| `net_amount` | `numeric(20,6)` | NOT NULL | — | Monto neto acreditado al cliente (`amount - fee_amount`). |
| `currency` | `text` | NOT NULL | — | Divisa del depósito acreditado (ej. `'USDC'`, `'USD'`). |
| `source_currency` | `text` | nullable | NULL | Divisa original del remitente (ej. `'USD'`, `'EUR'`, `'MXN'`). Puede diferir si hubo conversión. |
| **`sender_name`** | `text` | nullable | NULL | Nombre del remitente del depósito (devuelto por Bridge en el webhook). Fundamental para AML. |
| **`sender_bank_name`** | `text` | nullable | NULL | Banco del remitente (disponible en algunos Wire/ACH). |
| **`deposit_message`** | `text` | nullable | NULL | Mensaje de referencia incluido por el remitente (número de factura, contrato, etc.). |
| **`exchange_rate`** | `numeric(18,8)` | nullable | NULL | Tasa de cambio aplicada en la conversión (ej. 1 USD = 1.0001 USDC). |
| **`exchange_fee`** | `numeric(20,6)` | nullable | NULL | Fee de conversión de divisa cobrado por Bridge (del receipt). |
| `status` | `text` | NOT NULL, CHECK | `'pending'` | Estado: `'pending'`, `'processing'`, `'completed'`, `'failed'`, `'reversed'`. |
| `bridge_event_id` | `text` | UNIQUE, nullable | NULL | ID del evento de Bridge (deduplicación para prevenir doble acreditación). |
| `notes` | `text` | nullable | NULL | Notas internas del Staff para depósitos manuales o ajustes. |
| `completed_at` | `timestamptz` | nullable | NULL | Fecha de acreditación real al ledger. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación de la orden. |

*RLS: El usuario ve sus propias órdenes. Staff y Admin ven todas.*

## Relaciones
- **Pertenece a:** `profiles` y `wallets`.
- **Vía de pago:** `payin_routes` via `payin_route_id`.
- **Origina:** `ledger_entries` (un depósito completado genera una entry de tipo `deposit` y actualiza `balances`).

## Ejemplo JSON — Wire USD entrante

```json
{
  "id": "ord11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "wallet_id": "wal11111-e89b-12d3-a456-426614174000",
  "payin_route_id": "rte11111-e89b-12d3-a456-426614174000",
  "source_type": "bridge_virtual_account",
  "source_reference_id": "va_bridge_xxx",
  "amount": 5050.00,
  "fee_amount": 50.50,
  "net_amount": 4999.50,
  "currency": "USDC",
  "source_currency": "USD",
  "sender_name": "Guangzhou Electronics Ltd",
  "sender_bank_name": "Industrial and Commercial Bank of China",
  "deposit_message": "INV-2026-GZ-041",
  "exchange_rate": 1.00010000,
  "exchange_fee": 0.00,
  "status": "completed",
  "bridge_event_id": "evt_bridge_abc123",
  "notes": null,
  "completed_at": "2026-03-26T15:31:00Z",
  "created_at": "2026-03-26T15:30:00Z"
}
```
