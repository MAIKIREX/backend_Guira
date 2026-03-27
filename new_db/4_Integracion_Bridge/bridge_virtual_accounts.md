# Tabla: `public.bridge_virtual_accounts`

## Función de la Tabla
`bridge_virtual_accounts` almacena las cuentas bancarias virtuales emitidas por Bridge a favor de los clientes de la plataforma. Bridge soporta **5 tipos de cuentas virtuales** en distintas divisas con sus rails de pago locales correspondientes. Cuando un tercero envía dinero a una de estas cuentas, Bridge detecta el depósito, convierte automáticamente los fondos y los entrega en la wallet crypto del cliente.

**Referencia Bridge API:** `POST /v0/customers/{customer_id}/virtual_accounts`

## Tipos de Virtual Accounts Soportadas

| Tipo | Divisa | Rail | Instrucción de depósito |
|---|---|---|---|
| USD Account | `usd` | `ach_push`, `wire` | `routing_number` + `account_number` |
| SEPA / IBAN | `eur` | `sepa` | `iban` |
| MXN Account | `mxn` | `spei` | `clabe` (18 dígitos) |
| BRL Account | `brl` | `pix` | `br_code` (código QR PIX) |
| GBP Account (Beta) | `gbp` | `fps` | `sort_code` + `account_number` |

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID interno de la plataforma. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente propietario de la cuenta virtual. |
| `bridge_virtual_account_id` | `text` | UNIQUE, NOT NULL | — | ID provisto por Bridge (ej. `va_abc123`). |
| `bridge_customer_id` | `text` | NOT NULL | — | Customer ID de Bridge al que está vinculada. |
| `source_currency` | `text` | NOT NULL, CHECK | — | Moneda que acepta: `'usd'`, `'eur'`, `'mxn'`, `'brl'`, `'gbp'`. |
| `destination_currency` | `text` | NOT NULL | — | Moneda de destino tras la conversión (ej. `'usdc'`). |
| `destination_payment_rail` | `text` | NOT NULL | — | Red blockchain destino: `'ethereum'`, `'polygon'`, `'solana'`, `'base'`. |
| `destination_address` | `text` | nullable | NULL | Dirección crypto destino donde Bridge entrega los fondos convertidos. |
| **`destination_wallet_id`** | `uuid` | nullable, FK → `wallets.id` | NULL | FK a la wallet local del cliente a la que apunta esta VA. Vincula instrucción de depósito con wallet concreta. |
| `destination_external_account_id` | `text` | nullable | NULL | ID de cuenta externa fiat si el destino es bancario. |
| `bank_name` | `text` | nullable | NULL | Banco sponsor que emitió la cuenta (ej. `'Lead Bank'`). Solo para USD. |
| `bank_address` | `text` | nullable | NULL | Dirección física del banco sponsor. Solo para USD. |
| `beneficiary_name` | `text` | NOT NULL | — | Nombre del beneficiario registrado en Bridge. |
| **`beneficiary_address`** | `text` | nullable | NULL | Dirección postal del beneficiario (requerida por algunas instituciones para Wire). |
| `routing_number` | `text` | nullable | NULL | ACH/Wire routing number (solo para USD). |
| `account_number` | `text` | nullable | NULL | Número de cuenta (USD y GBP). |
| **`iban`** | `text` | nullable | NULL | IBAN completo para cuentas EUR (SEPA). Formato: `ES91 2100 0418 4502 0005 1332`. |
| **`clabe`** | `text` | nullable | NULL | CLABE de 18 dígitos para cuentas MXN (SPEI). |
| **`br_code`** | `text` | nullable | NULL | Código BR_Code (PIX QR) completo para cuentas BRL. |
| **`sort_code`** | `text` | nullable | NULL | Sort code de 6 dígitos para cuentas GBP (FPS). |
| `payment_rails` | `text[]` | NOT NULL | `'{}'` | Vías aceptadas: ej. `['ach_push', 'wire']`, `['sepa']`, `['spei']`. |
| `developer_fee_percent` | `numeric(10,4)` | NOT NULL | `0` | Fee cobrado por depósito recibido (en la moneda fuente). |
| `status` | `text` | NOT NULL, CHECK | `'activated'` | Estado: `'activated'`, `'deactivated'`, `'suspended'`. |
| **`deactivated_at`** | `timestamptz` | nullable | NULL | Fecha en que Bridge desactivó la cuenta virtual (si aplica). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |

*RLS: El cliente ve solo sus propias cuentas. Staff y Admin ven todas.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Wallet destino:** `wallets` via `destination_wallet_id` (FK explícita que indica qué wallet recibe los fondos).
- **Fuente de:** `bridge_virtual_account_events`.
- **Origina:** `payment_orders` → `ledger_entries`.

## Ejemplo JSON — USD Account

```json
{
  "id": "bva11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "bridge_virtual_account_id": "va_1a400dae-f7fc-4f75",
  "bridge_customer_id": "cust_bridge_abc123",
  "source_currency": "usd",
  "destination_currency": "usdc",
  "destination_payment_rail": "ethereum",
  "destination_address": "0x3f5CE5FBFe3E9af3971dD833D26BA9b5C936f0bE",
  "destination_wallet_id": "wal11111-e89b-12d3-a456-426614174000",
  "destination_external_account_id": null,
  "bank_name": "Lead Bank",
  "bank_address": "1801 Main St., Kansas City, MO 64108",
  "beneficiary_name": "Tech Corp SA",
  "beneficiary_address": "923 Folsom Street, 302, San Francisco, CA 94107, US",
  "routing_number": "101019644",
  "account_number": "215268120000",
  "iban": null,
  "clabe": null,
  "br_code": null,
  "sort_code": null,
  "payment_rails": ["ach_push", "wire"],
  "developer_fee_percent": 1.0,
  "status": "activated",
  "deactivated_at": null,
  "created_at": "2026-01-20T12:00:00Z"
}
```

## Ejemplo JSON — MXN Account (SPEI)

```json
{
  "bridge_virtual_account_id": "va_35334433-dcee-48e8",
  "source_currency": "mxn",
  "destination_currency": "usdc",
  "destination_payment_rail": "ethereum",
  "beneficiary_name": "Ada Lovelace",
  "clabe": "568980546701071234",
  "routing_number": null, "account_number": null, "iban": null, "br_code": null,
  "payment_rails": ["spei"],
  "status": "activated"
}
```

## Ejemplo JSON — BRL Account (PIX)

```json
{
  "bridge_virtual_account_id": "va_6e6ab621-6749",
  "source_currency": "brl",
  "beneficiary_name": "Edson Arantes",
  "br_code": "00020126770014br.gov.bcb.pix01366e6ab621...",
  "payment_rails": ["pix"],
  "status": "activated"
}
```
