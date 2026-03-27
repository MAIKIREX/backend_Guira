# Tabla: `public.bridge_liquidation_addresses`

## Función de la Tabla
`bridge_liquidation_addresses` almacena las direcciones de liquidación de Bridge: son direcciones blockchain que, cuando reciben criptomonedas (USDC, ETH), automáticamente las convierten y envían en fiat (USD) a la cuenta bancaria externa del cliente. Este mecanismo permite a los clientes recibir pagos crypto y convertirlos a dólares directamente en su banco, sin intervención manual.

**Referencia Bridge API:** `POST /v0/customers/{customer_id}/liquidation_addresses`

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID interno de la plataforma. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente propietario. |
| `bridge_liquidation_address_id` | `text` | UNIQUE, NOT NULL | — | ID provisto por Bridge (ej. `liq_addr_xyz`). |
| `bridge_customer_id` | `text` | NOT NULL | — | Customer en Bridge al que pertenece. |
| `chain` | `text` | NOT NULL | — | Blockchain de la dirección: `'ethereum'`, `'solana'`, `'polygon'`, `'base'`. |
| `currency` | `text` | NOT NULL | — | Cripto que acepta la dirección: `'usdc'`, `'usdt'`, `'eth'`. |
| `address` | `text` | UNIQUE, NOT NULL | — | Dirección blockchain pública (ej. `0xBridgeLiqAddr...`). Única por cliente/chain/currency. |
| `destination_payment_rail` | `text` | NOT NULL | — | Rail de salida en fiat: `'ach'`, `'wire'`, `'sepa'`. |
| `destination_currency` | `text` | NOT NULL | — | Divisa fiat de destino: `'usd'`, `'eur'`. |
| `destination_external_account_id` | `text` | NOT NULL | — | ID de la cuenta externa en Bridge donde llegará el fiat convertido. |
| `developer_fee_percent` | `numeric(10,4)` | NOT NULL | `0` | Fee del desarrollador aplicado a cada conversión. |
| `is_active` | `boolean` | NOT NULL | `true` | Si la dirección está activa y recibiendo fondos. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |

*RLS: El cliente ve solo sus propias direcciones. Staff y Admin ven todas.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Origina:** `payment_orders` → `ledger_entries` cuando se reciben fondos.

## Ejemplo JSON

```json
{
  "id": "bla11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "bridge_liquidation_address_id": "liq_addr_abc987",
  "bridge_customer_id": "cust_bridge_abc123",
  "chain": "ethereum",
  "currency": "usdc",
  "address": "0x3f5CE5FBFe3E9af3971dD833D26BA9b5C936f0bE",
  "destination_payment_rail": "ach",
  "destination_currency": "usd",
  "destination_external_account_id": "ext_acct_xyz987abc",
  "developer_fee_percent": 0.5,
  "is_active": true,
  "created_at": "2026-01-22T10:00:00Z"
}
```
