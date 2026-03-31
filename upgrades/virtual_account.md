# Reporte: Creación de Virtual Account (Bridge API)

> **Última actualización:** 2026-03-31  
> **Estado:** ✅ Corregido y alineado con Bridge API

---

## 📋 Resumen del Flujo

Una **Virtual Account** es una cuenta bancaria virtual emitida por Bridge que permite a los clientes de Guira recibir depósitos en fiat (USD, EUR, MXN, BRL, GBP) que se convierten automáticamente a crypto (USDC, USDT, etc.) y se envían a una dirección blockchain.

---

## 🔌 Bridge API — Endpoint

```
POST /v0/customers/{customer_id}/virtual_accounts
```

### Payload (formato anidado requerido por Bridge)

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

### Respuesta de Bridge (ejemplo USD)

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

---

## 🗄️ Tabla: `bridge_virtual_accounts`

| Columna | Tipo | Fuente | Descripción |
|---|---|---|---|
| `id` | uuid | Auto (Supabase) | PK interna |
| `user_id` | uuid | Backend | FK → profiles.id |
| `bridge_virtual_account_id` | text | Bridge response `.id` | ID de la VA en Bridge |
| `bridge_customer_id` | text | Backend | Customer ID en Bridge |
| `source_currency` | text | DTO | Moneda del depósito (usd/eur/mxn/brl/gbp) |
| `destination_currency` | text | DTO | Moneda destino (usdc/usdt) |
| `destination_payment_rail` | text | DTO | Red blockchain destino |
| `destination_address` | text | Bridge response / DTO | Address blockchain |
| `destination_wallet_id` | uuid | DTO (opcional) | FK → wallets.id (wallet interna) |
| `destination_external_account_id` | text | DTO (opcional) | ID de external account si aplica |
| `bank_name` | text | Bridge `sdi.bank_name` | Nombre del banco |
| `bank_address` | text | Bridge `sdi.bank_address` | Dirección del banco |
| `beneficiary_name` | text | Bridge `sdi.bank_beneficiary_name` | Nombre del beneficiario |
| `beneficiary_address` | text | Bridge `sdi.bank_beneficiary_address` | Dirección del beneficiario |
| `routing_number` | text | Bridge `sdi.bank_routing_number` | Routing number (USD) |
| `account_number` | text | Bridge `sdi.bank_account_number` | Account number (USD) |
| `iban` | text | Bridge `sdi.iban` | IBAN (EUR) |
| `clabe` | text | Bridge `sdi.clabe` | CLABE (MXN) |
| `br_code` | text | Bridge `sdi.br_code` | Código PIX (BRL) |
| `sort_code` | text | Bridge `sdi.sort_code` | Sort code (GBP) |
| `payment_rails` | text[] | Bridge `sdi.payment_rails` | Rails disponibles |
| `developer_fee_percent` | numeric | DTO / app_settings | % fee sobre depósitos |
| `status` | text | Backend | CHECK: active/inactive/pending |
| `deactivated_at` | timestamptz | Backend | Fecha de desactivación |
| `is_external_sweep` | boolean | Backend | true = fondos van a wallet externa |
| `external_destination_label` | text | DTO | Etiqueta de wallet externa |
| `created_at` | timestamptz | Auto | Fecha de creación |

> `sdi` = `source_deposit_instructions` de la respuesta de Bridge

---

## 📥 DTO: `CreateVirtualAccountDto`

| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| `source_currency` | string | ✅ | `@IsEnum(['usd','eur','mxn','brl','gbp'])` |
| `destination_currency` | string | ✅ | `@IsString @IsNotEmpty` |
| `destination_payment_rail` | string | ✅ | `@IsEnum(['ethereum','polygon','solana','base','arbitrum','optimism','stellar'])` |
| `destination_wallet_id` | UUID | ❌ | `@IsUUID` — Wallet interna de Guira |
| `destination_address` | string | ❌ | `@IsString` — Wallet externa (Binance, MetaMask) |
| `destination_label` | string | ❌ | `@MaxLength(100)` — Etiqueta de la wallet |
| `developer_fee_percent` | number | ❌ | `@Min(0) @Max(100)` — Fee %. Fallback a `app_settings.DEFAULT_VA_FEE_PERCENT` |

### Reglas de negocio del DTO:
- **Mutuamente excluyentes:** No se puede enviar `destination_wallet_id` y `destination_address` al mismo tiempo
- Si `destination_address` se envía → `is_external_sweep = true` (fondos salen de Guira)
- Si `destination_wallet_id` se envía → Resuelve el `address` desde la tabla `wallets`
- Si ninguno se envía → Se usa la wallet por defecto del usuario

---

## ⚙️ Lógica en `BridgeService.createVirtualAccount()`

### Flujo paso a paso:

```
1. getVerifiedProfile(userId)
   → Valida: onboarding approved, is_active, !is_frozen, bridge_customer_id exists

2. Verificar duplicados
   → SELECT bridge_virtual_accounts WHERE user_id, source_currency, status='active'
   → Si existe → 400 "Ya tienes una VA activa para {currency}"

3. Determinar destino
   → Caso A: destination_wallet_id → resolve wallets.address
   → Caso B: destination_address → usar directamente, isExternalSweep=true
   → Caso C: Ninguno → sin address (Bridge asigna)

4. Determinar developer_fee_percent
   → Si DTO tiene valor → usar
   → Si no → leer app_settings.DEFAULT_VA_FEE_PERCENT

5. POST Bridge API (formato correcto)
   → { source: { currency }, destination: { payment_rail, currency, address } }

6. Extraer source_deposit_instructions de la respuesta
   → bank_name, bank_address, beneficiary_name, beneficiary_address
   → routing_number, account_number, iban, clabe, br_code, sort_code
   → payment_rails

7. INSERT bridge_virtual_accounts con TODOS los campos

8. Return data al cliente
```

---

## 📡 Webhook: `virtual_account.funds_received`

Cuando un tercero envía dinero a los datos bancarios de la VA, Bridge dispara este webhook:

### Caso A: Depósito Interno (wallet de Guira)
```
webhook_events → bridge_virtual_account_events → payment_order
→ ledger_entry (credit, settled) → trigger actualiza balances → notification
```

### Caso B: External Sweep (wallet externa)
```
webhook_events → bridge_virtual_account_events → payment_order (swept_external)
→ ledger_entry CREDIT (+$X) + ledger_entry DEBIT (-$X) = Balance neto $0
→ notification informando que fondos fueron reenviados
```

---

## 🔧 Correcciones Aplicadas (2026-03-31)

| # | Corrección | Archivo | Severidad |
|---|---|---|---|
| 1 | Payload a Bridge cambiado de campos planos a objetos anidados `source`/`destination` | `bridge.service.ts` | 🔴 Crítico |
| 2 | Agregado `developer_fee_percent` al DTO y al payload de Bridge | DTO + Service | 🟠 Alto |
| 3 | Ahora se extraen TODOS los campos de `source_deposit_instructions` | `bridge.service.ts` | 🟠 Alto |
| 4 | Corregidos nombres de campos de Bridge (`bank_routing_number` → `routing_number`) | `bridge.service.ts` | 🟡 Medio |
| 5 | Agregada validación `@IsEnum` para `source_currency` (5 monedas) | DTO | 🟡 Medio |
| 6 | Agregada validación `@IsEnum` para `destination_payment_rail` (7 redes) | DTO | 🟡 Medio |