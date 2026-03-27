# Bridge API — Referencia de Servicios

> **Base URL:** `https://api.bridge.xyz/v0`  
> **Autenticación:** Header `Api-Key: <your-api-key>` (HTTP Basic Auth sin usuario/contraseña)  
> **Obligatorio:** Todas las requests sobre HTTPS. Respuesta 401 si key inválida o ausente.  
> **Sandbox:** `https://api.bridge.xyz/v0` con keys de sandbox independientes por dev account.

---

## 🏛️ Capacidades de la Plataforma Bridge

Bridge es una plataforma de orquestación financiera que permite:

| Capacidad | Descripción |
|---|---|
| **Send & Receive Payments** | Mover fondos globalmente usando fiat rails, stablecoins o digital assets |
| **Virtual Accounts** | Emitir cuentas bancarias virtuales USD, EUR, MXN, BRL, GBP con datos bancarios locales reales |
| **Custody Wallets** | Wallets custodias para retener balances de stablecoins de forma segura |
| **Stablecoin Issuance** | Emitir tu propia stablecoin o usar USDB para ganar rewards sobre saldos retenidos |
| **Card Issuance** | Tarjetas Visa virtuales para que usuarios gasten desde sus saldos de stablecoin |
| **Liquidation Addresses** | Direcciones blockchain que auto-convierten crypto recibida en fiat y lo envían a cuenta bancaria |
| **Prefunded Accounts** | Cuentas pre-fondeadas para ejecuciones de pago instantáneas sin esperar depósitos |
| **KYC Links** | Links para que los clientes completen su verificación de identidad vía Bridge |
| **Exchange Rates** | Consultar tasas de cambio en tiempo real entre divisas |
| **Batch Settlements** | Liquidaciones masivas en lote |
| **Funds Requests** | Solicitudes de fondos entre partes |
| **Associated Persons** | Personas asociadas a una empresa para el KYB |

---

## 🔐 Autenticación

```bash
# Toda request requiere este header:
curl --header 'Api-Key: <your-api-key>'

# Environments:
# Production: https://api.bridge.xyz/v0
# Sandbox:    Mismo endpoint, key diferente (scoped por dev account)
```

---

## 🔁 Idempotencia

Todas las requests de creación (POST) deben incluir:

```bash
--header 'Idempotency-Key: <unique-uuid>'
```

- Si se reintenta con la misma key → Bridge devuelve el mismo objeto sin crear duplicados.
- Esencial para prevenir doble cobro o doble acreditación.

---

## 👤 Customers (KYC/KYB)

### Estructura del Customer en Bridge
Un Customer representa a un usuario verificado en Bridge. Se crea después de que el expediente KYC/KYB es aprobado.

```
POST /v0/customers
GET  /v0/customers/{customer_id}
GET  /v0/customers
```

**Campos clave del Customer:**
- `id` — ID único en Bridge (se guarda en `profiles.bridge_customer_id`)
- `type` — `individual` (KYC) o `business` (KYB)
- `status` — `active`, `pending`, `rejected`
- `kyc_link` — Link para que el usuario complete su verificación en Bridge (si se usa el flujo de KYC Links)

### KYC Links (Flujo Alternativo)
En lugar de enviar los datos directamente, Bridge puede generar un link que el cliente completa:

```
POST /v0/kyc_links
```

Responde con una URL que el usuario abre para completar su KYC interactivo con Bridge.

---

## 🏦 Virtual Accounts

Las Virtual Accounts asignan números bancarios locales reales a los clientes para que puedan recibir transferencias bancarias en múltiples divisas.

### Endpoint
```
POST /v0/customers/{customer_id}/virtual_accounts
```

### Tipos de Virtual Accounts Disponibles

| Tipo | Divisa | Rails de Depósito | Instrucciones |
|---|---|---|---|
| **USD Virtual Account** | `usd` | `ach_push`, `wire` | routing_number + account_number (Lead Bank) |
| **SEPA Virtual IBAN** | `eur` | `sepa` | IBAN europeo (banco local) |
| **MXN Virtual Account** | `mxn` | `spei` | CLABE (18 dígitos) |
| **BRL Virtual Account** | `brl` | `pix` | Código PIX (QR o key) |
| **GBP Virtual Account (Beta)** | `gbp` | `fps` | Sort code + account number |

### Request (USD → USDC en Ethereum)
```json
{
  "source": { "currency": "usd" },
  "destination": {
    "payment_rail": "ethereum",
    "currency": "usdc",
    "address": "0x3f5CE5FBFe3E9af3971dD833D26BA9b5C936f0bE"
  },
  "developer_fee_percent": "1.0"
}
```

### Response Completa (USD)
```json
{
  "id": "1a400dae-f7fc-4f75-8105-212a14d4132d",
  "status": "activated",
  "developer_fee_percent": "1.0",
  "customer_id": "23c2d200-4c00-4c5a-b31a-00d035d7e0ae",
  "created_at": "2025-07-04T22:10:34.564Z",
  "source_deposit_instructions": {
    "currency": "usd",
    "bank_name": "Lead Bank",
    "bank_address": "1801 Main St., Kansas City, MO 64108",
    "bank_routing_number": "101019644",
    "bank_account_number": "215268120000",
    "bank_beneficiary_name": "Ada Lovelace",
    "bank_beneficiary_address": "923 Folsom Street, 302, San Francisco, CA 941070000, US",
    "payment_rail": "ach_push",
    "payment_rails": ["ach_push", "wire"]
  },
  "destination": {
    "currency": "usdc",
    "payment_rail": "ethereum",
    "address": "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be"
  }
}
```

### Response Completa (MXN)
```json
{
  "source_deposit_instructions": {
    "currency": "mxn",
    "clabe": "568980546701071234",
    "account_holder_name": "Ada Lovelace",
    "payment_rails": ["spei"]
  }
}
```

### Response Completa (BRL - PIX)
```json
{
  "source_deposit_instructions": {
    "currency": "brl",
    "br_code": "00020126770014br.gov.bcb.pix...",
    "account_holder_name": "Edson Arantes do Nascimento",
    "payment_rails": ["pix"]
  }
}
```

---

## 🔄 Transfers

Orquesta el movimiento de fondos de cualquier fuente a cualquier destino, con conversión de divisa automática cuando es necesario.

### Endpoint
```
POST /v0/transfers
GET  /v0/transfers/{transfer_id}
GET  /v0/transfers
```

### Campos Clave del Request

| Campo | Tipo | Descripción |
|---|---|---|
| `on_behalf_of` | `string` | Customer ID. Obligatorio para operar en nombre de un usuario |
| `source.payment_rail` | `string` | Origen: `ach_push`, `wire`, `sepa`, `ethereum`, `solana`, `polygon`, `usdc` |
| `source.currency` | `string` | Moneda del origen: `usd`, `eur`, `usdc`, `usdt` |
| `destination.payment_rail` | `string` | Destino: `ach`, `wire`, `sepa`, `ethereum`, `polygon`, `solana` |
| `destination.currency` | `string` | Moneda del destino |
| `destination.to_address` | `string` | Dirección crypto destino (si aplica) |
| `destination.external_account_id` | `string` | ID de cuenta externa bancaria (si es fiat) |
| `amount` | `string` | Monto en string (precisión de decimales) |
| `developer_fee` | `string` | Fee fijo en moneda fuente (ej. `"0.5"`) |
| `developer_fee_percent` | `string` | Fee como porcentaje (ej. `"1.0"` = 1%) |
| `features` | `object` | Opciones: `allow_any_from_address`, `flexible_amount` |

### Estados del Transfer

| Estado | Descripción |
|---|---|
| `awaiting_funds` | Esperando depósito del cliente según source_deposit_instructions |
| `payment_processed` | Fondos recibidos, Bridge procesando la conversión |
| `complete` | Transfer ejecutado exitosamente |
| `failed` | Transfer falló (fondos devueltos si ya se recibieron) |
| `reversed` | Transfer reversado |

### Response Completa
```json
{
  "id": "transfer_123",
  "state": "awaiting_funds",
  "on_behalf_of": "cust_alice",
  "amount": "10.0",
  "developer_fee": "0.5",
  "source": { "payment_rail": "ach_push", "currency": "usd" },
  "destination": {
    "payment_rail": "polygon",
    "currency": "usdc",
    "to_address": "0xdeadbeef"
  },
  "source_deposit_instructions": {
    "bank_account_number": "123456789",
    "bank_routing_number": "101019644",
    "amount": "10.0",
    "currency": "usd",
    "deposit_message": "BVI7depositmessage"
  },
  "receipt": {
    "initial_amount": "10.0",
    "developer_fee": "0.5",
    "exchange_fee": "0.0",
    "final_amount": "9.5",
    "destination_tx_hash": "0xc0ffee"
  },
  "created_at": "2023-05-05T19:39:14.316Z",
  "updated_at": "2023-05-05T19:39:15.231Z"
}
```

---

## 💸 Developer Fees

### En Transfers
- **Fee fijo:** `"developer_fee": "0.5"` → $0.50 USD fijo
- **Fee porcentaje:** `"developer_fee_percent": "1.0"` → 1% del monto
- El fee siempre en la moneda fuente
- Máximo 5 dígitos de precisión decimal (ej. `0.00119` ✅, `0.0000001` ❌)
- Si es blank → equivale a 0.0

### En Virtual Accounts
- `"developer_fee_percent": "1.0"` aplicado sobre cada depósito recibido
- Fee en la moneda fuente de la Virtual Account

### En Liquidation Addresses
- `"developer_fee_percent"` configurado al crear la dirección
- Aplicado sobre cada depósito crypto recibido

### Fee Account
- Configurar via `POST /v0/developers/fee_external_account` para indicar dónde llegan tus fees

---

## 🏦 External Accounts (Cuentas Bancarias Externas del Cliente)

Cuenta bancaria real del cliente (destino de retiros/payouts).

```
POST /v0/customers/{customer_id}/external_accounts
GET  /v0/customers/{customer_id}/external_accounts
```

**Request:**
```json
{
  "currency": "usd",
  "account": {
    "routing_number": "026009593",
    "account_number": "987654321",
    "account_type": "checking"
  },
  "owner": { "name": "Tech Corp SA", "type": "business" }
}
```

---

## 📦 Bridge Wallets (Custodial Wallets)

Wallets custodias gestionadas por Bridge para retener stablecoins.

```
GET  /v0/bridge_wallets
POST /v0/customers/{customer_id}/bridge_wallets
```

Cada wallet tiene:
- `id` — ID de la wallet en Bridge
- `address` — Dirección blockchain pública
- `network` — Blockchain (`ethereum`, `polygon`, `solana`)
- `currency` — Divisa (`usdc`, `usdt`)

---

## 📍 Liquidation Addresses

Direcciones blockchain que, al recibir crypto, la convierten automáticamente y envían el fiat al External Account del cliente.

```
POST /v0/customers/{customer_id}/liquidation_addresses
```

**Request:**
```json
{
  "chain": "ethereum",
  "currency": "usdc",
  "destination_payment_rail": "ach",
  "destination_currency": "usd",
  "destination_external_account_id": "ext_acct_xyz",
  "developer_fee_percent": "0.5"
}
```

---

## 📡 Webhooks

Bridge envía eventos via POST a tu endpoint cuando ocurre algo relevante.

```
POST /v0/webhooks   ← Registrar tu endpoint de webhooks
```

### Tipos de Eventos Clave

| Evento | Descripción |
|---|---|
| `virtual_account.funds_received` | Wire/ACH/SEPA/PIX/SPEI recibido en Virtual Account |
| `transfer.payment_processed` | Fondos recibidos por Bridge en un Transfer |
| `transfer.complete` | Transfer finalizado exitosamente |
| `transfer.failed` | Transfer falló |
| `kyc_link.approved` | Usuario aprobado vía KYC Link |
| `kyc_link.rejected` | Usuario rechazado vía KYC Link |
| `liquidation_address.payment_completed` | Liquidación automática completada |

---

## 🔁 Flujos de Servicios Disponibles

### 1. Exterior → Wallet del cliente (Pay-In Fiat a Crypto)
```
USD/EUR/MXN/BRL/GBP (Wire/ACH/SEPA/SPEI/PIX)
    → Virtual Account Bridge
    → Auto-convert a USDC/USDT/ETH
    → Wallet blockchain del cliente
```

### 2. Wallet → Exterior / Bolivia (Payout Crypto a Fiat)
```
USDC/USDT (Bridge Wallet del cliente)
    → Transfer (on_behalf_of)
    → Wire/ACH/SEPA a External Account
    → Cuenta bancaria destino (en cualquier país)
```

### 3. Bolivia/Exterior → Exterior (Fiat a Fiat cross-border)
```
USD (depósito local)
    → Transfer (fiat-to-fiat)
    → Wire/SWIFT a banco destino internacional
```

### 4. Crypto → Crypto
```
USDC en Ethereum
    → Transfer (source: ethereum/usdc, destination: solana/usdc)
    → USDC en Solana
```

### 5. Liquidación automática (Crypto → Fiat directo)
```
USDC enviado a Liquidation Address
    → Auto-convert → USD
    → ACH/Wire a cuenta bancaria del cliente
```
