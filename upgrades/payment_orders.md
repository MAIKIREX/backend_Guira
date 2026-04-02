# Payment Orders — Especificación Técnica Completa

> **Última actualización:** 2026-04-01  
> **Estado:** 📐 En diseño — Pendiente de aprobación  
> **Autor:** Equipo Guira Backend

---

## 📋 Resumen Ejecutivo

Guira opera como plataforma financiera para Bolivia ↔ Mundo. Este documento define los **12 casos de uso** de movimiento de fondos, divididos en dos servicios principales:

1. **Servicio de Movimientos Interbancarios** — Transferencias entre cuentas bancarias/wallets con destino final fuera de la wallet de Bridge.
2. **Servicio de Movimientos de Wallet Bridge** — Rampas de acceso/salida entre fiat(BO/US), crypto(USDT) y la wallet custodiada por Bridge.

### Concepto Clave: PSAV (Proveedor de Servicios de Activos Virtuales)

Bridge **no soporta operaciones directas en bolivianos (BOB)**. Para los flujos que involucran BOB ↔ USD/Crypto, se requiere un **intermediario humano (PSAV/Operador)** que:
- Recibe depósitos en BOB del cliente (vía QR o transfer bancario local)
- Ejecuta la conversión BOB → USD/Crypto según tipo de cambio vigente
- Realiza el envío al destino final (cuenta externa, wallet Bridge, etc.)
- Genera comprobantes (hash de transacción, factura/recibo)

Los flujos mediados por PSAV requieren **revisión y aprobación manual por staff/admin**, a diferencia de los flujos directos por Bridge que son **automáticos**.

---

## 🏗️ Arquitectura de Servicios

```
┌──────────────────────────────────────────────────────────────────────┐
│                      PAYMENT ORDERS MODULE                          │
├─────────────────────────┬────────────────────────────────────────────┤
│   PaymentOrderService   │   Orquestador central de todas las        │
│                         │   órdenes de pago independiente del flujo  │
├─────────────────────────┼────────────────────────────────────────────┤
│ InterBankService        │ Flujos 1.1 — 1.5 (Bolivia ↔ Mundo)       │
│ (mediados por PSAV o    │ El dinero NO se queda en wallet Bridge    │
│  por Bridge directo)    │                                           │
├─────────────────────────┼────────────────────────────────────────────┤
│ WalletRampService       │ Flujos 2.1 — 2.6 (Rampas on/off)        │
│ (rampas de acceso y     │ El dinero ENTRA o SALE de wallet Bridge   │
│  salida de Bridge)      │                                           │
└─────────────────────────┴────────────────────────────────────────────┘
```

---

## 📊 Clasificación de Flujos

### Leyenda de Roles

| Símbolo | Significado |
|---------|-------------|
| 🧑 | Usuario (frontend) |
| 🤖 | Backend automático |
| 👨‍💼 | Staff/Admin (panel admin) |
| 🔗 | Bridge API |
| 🏦 | PSAV (intermediario) |

### Matriz de Flujos

| # | Flujo | Dirección | Requiere PSAV | Requiere Bridge API | Estados del ciclo |
|---|-------|-----------|:---:|:---:|---|
| **1.1** | `bolivia_to_world` | BOB → Fiat(US/EU) | ✅ | ❌ | `created → waiting_deposit → deposit_received → processing → sent → completed` |
| **1.2** | `wallet_to_wallet` | Wallet → Wallet | ❌ | ✅ | `created → waiting_deposit → completed` |
| **1.3** | `bolivia_to_wallet` | BOB → Wallet externa | ✅ | ❌ | `created → waiting_deposit → deposit_received → processing → sent → completed` |
| **1.4** | `world_to_bolivia` | Fiat(US) → BOB | ✅ | ❌ | `created → waiting_deposit → deposit_received → processing → sent → completed` |
| **1.5** | `world_to_wallet` | Fiat(US) → Wallet Bridge | ❌ | ✅ (VA) | `created → waiting_deposit → completed` |
| **2.1** | `fiat_bo_to_bridge_wallet` | BOB → Wallet Bridge | ✅ | ❌ | `created → waiting_deposit → deposit_received → processing → sent → completed` |
| **2.2** | `crypto_to_bridge_wallet` | USDT → Wallet Bridge | ❌ | ✅ | `created → waiting_deposit → completed` |
| **2.3** | `fiat_us_to_bridge_wallet` | Fiat(US) → Wallet Bridge | ❌ | ✅ (VA) | `created → waiting_deposit → completed` |
| **2.4** | `bridge_wallet_to_fiat_bo` | Wallet Bridge → BOB | ✅ | ❌ | `created → waiting_deposit → deposit_received → processing → sent → completed` |
| **2.5** | `bridge_wallet_to_crypto` | Wallet Bridge → USDT | ❌ | ✅ | `created → waiting_deposit → completed` |
| **2.6** | `bridge_wallet_to_fiat_us` | Wallet Bridge → Fiat(US) | ❌ | ✅ | `created → waiting_deposit → completed` |

---

## 🔄 Máquina de Estados

### Flujos con PSAV (Ciclo Completo — 6 estados)

```
  ┌──────────┐    Usuario crea     ┌──────────────────┐
  │ (inicio) │ ──────────────────> │     created       │
  └──────────┘                     └────────┬─────────┘
                                            │
                 Backend muestra QR/cuenta   │
                 bancaria del PSAV           │
                                            ▼
                                   ┌──────────────────┐
                                   │  waiting_deposit  │
                                   └────────┬─────────┘
                                            │
                 Usuario confirma depósito   │
                 (sube comprobante)          │
                                            ▼
                                   ┌──────────────────┐
                                   │ deposit_received  │
                                   └────────┬─────────┘
                                            │
                 Staff/Admin verifica datos, │
                 fee, tipo de cambio         │
                                            ▼
                                   ┌──────────────────┐
                                   │   processing      │
                                   └────────┬─────────┘
                                            │
                 PSAV ejecuta envío,         │
                 staff añade hash/tx_id      │
                                            ▼
                                   ┌──────────────────┐
                                   │      sent         │
                                   └────────┬─────────┘
                                            │
                 Staff sube factura/recibo   │
                                            ▼
                                   ┌──────────────────┐
                                   │    completed      │
                                   └──────────────────┘

                  * En cualquier paso:
                  ┌──────────────────┐
                  │     failed       │  ← Observación + Notificación al cliente
                  └──────────────────┘
```

### Flujos Automáticos (Bridge — 3 estados)

```
  ┌──────────┐    Usuario crea     ┌──────────────────┐
  │ (inicio) │ ──────────────────> │     created       │
  └──────────┘                     └────────┬─────────┘
                                            │
               Backend llama Bridge API,    │
               obtiene source_deposit_      │
               instructions                 │
                                            ▼
                                   ┌──────────────────┐
                                   │  waiting_deposit  │
                                   └────────┬─────────┘
                                            │
               Bridge webhook confirma      │
               depósito automáticamente     │
                                            ▼
                                   ┌──────────────────┐
                                   │    completed      │
                                   └──────────────────┘
```

---

## 📝 Detalle de Cada Flujo

### 1.1 `bolivia_to_world` — Bolivia → Fiat Exterior (Mediado por PSAV)

**Propósito:** El usuario envía dinero desde Bolivia (BOB) a una cuenta bancaria en el exterior (USD, EUR, etc.)

**Prerrequisitos del usuario:**
- Cuenta verificada (KYC/KYB aprobado)
- Al menos una **cuenta externa (external_account)** registrada en Bridge como destino

#### Frontend — Formulario de Creación

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en BOB a enviar |
| `destination_currency` | string | ✅ | Moneda destino (usd, eur, etc.) |
| `external_account_id` | uuid | ✅ | FK → `bridge_external_accounts.id` (proveedor/destino seleccionado) |
| `business_purpose` | string | ✅ | Motivo del pago |
| `supporting_document_url` | string | ❌ | URL del documento de respaldo (factura, contrato) |
| `notes` | string | ❌ | Notas adicionales |

#### Frontend — Pantalla de Revisión (pre-confirmación)

El frontend muestra al usuario un resumen antes de confirmar:
- Monto origen (BOB)
- Tipo de cambio estimado (BOB → USD)
- Monto destino estimado (USD)
- Fee estimado
- Datos del destino (banco, titular, últimos 4 dígitos)
- Motivo del pago

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/interbank
   body: { flow_type: "bolivia_to_world", amount, external_account_id, business_purpose, ... }

2. 🤖 Backend:
   - Valida perfil verificado (getVerifiedProfile)
   - Calcula fee vía FeesService.calculateFee(userId, "interbank_bo_out", "psav", amount)
   - Obtiene tipo de cambio vigente de app_settings o exchange_rates_config
   - Crea payment_order con status = "created"
   - Retorna: { order_id, fee, exchange_rate, estimated_destination_amount }

3. 🤖 Backend busca datos del PSAV para mostrar al usuario:
   - QR de pago del PSAV (de tabla psav_deposit_accounts o app_settings)
   - Cuenta bancaria nacional del PSAV
   - Estado cambia a → "waiting_deposit"

4. 🧑 Usuario realiza depósito BOB en la cuenta/QR del PSAV

5. 🧑 POST /payment-orders/:id/confirm-deposit
   body: { deposit_proof_url: "https://..." }  (comprobante de depósito)
   - Estado cambia a → "deposit_received"

6. 👨‍💼 Panel Admin: Staff ve la orden en lista de pendientes
   - Verifica comprobante de depósito
   - Verifica monto, fee, tipo de cambio
   - POST /admin/payment-orders/:id/approve
     body: { exchange_rate_applied, fee_final, notes }
   - Estado cambia a → "processing"

7. 🏦 PSAV ejecuta el envío hacia la cuenta externa del destino
   - 👨‍💼 POST /admin/payment-orders/:id/mark-sent
     body: { tx_hash, provider_reference }
   - Estado cambia a → "sent"

8. 👨‍💼 POST /admin/payment-orders/:id/complete
   body: { receipt_url: "https://..." }  (factura/recibo del PSAV)
   - Estado cambia a → "completed"
   - Se genera certificado
   - Se envía notificación al usuario

   ⚠️ Si hay observaciones en cualquier paso:
   POST /admin/payment-orders/:id/fail
   body: { reason, notify_user: true }
   - Estado cambia a → "failed"
   - Se envía notificación al cliente con el motivo
```

#### Datos que se almacenan en `payment_orders`

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "flow_type": "bolivia_to_world",
  "flow_category": "interbank",
  "source_type": "fiat_bo",
  "source_currency": "BOB",
  "destination_type": "fiat_external",
  "destination_currency": "USD",
  "external_account_id": "uuid → bridge_external_accounts",
  "amount_source": 6900.00,
  "exchange_rate": 6.90,
  "amount_destination": 1000.00,
  "fee_amount": 15.00,
  "net_amount": 985.00,
  "business_purpose": "Pago a proveedor X",
  "supporting_document_url": "https://...",
  "deposit_proof_url": "https://...",
  "tx_hash": "0xabc...",
  "provider_reference": "PSAV-2026-001",
  "receipt_url": "https://...",
  "psav_account_shown": { "bank": "BNB", "account": "123...", "qr_url": "..." },
  "status": "created",
  "approved_by": null,
  "approved_at": null,
  "notes": "",
  "created_at": "...",
  "updated_at": "..."
}
```

---

### 1.2 `wallet_to_wallet` — Crypto Externa → Crypto Externa (Vía Bridge Transfer)

**Propósito:** El usuario transfiere crypto desde una wallet externa propia hacia otra wallet crypto externa. Ninguna de las dos es una wallet de Bridge ni está registrada en `bridge_external_accounts` — el usuario **introduce las direcciones manualmente** en el formulario.

**Integración Bridge:** `POST /v0/transfers` (usando `from_address` / `to_address`, NO `external_account_id`)

**Ejemplo de uso:** Un usuario quiere mover 500 USDT desde su wallet en Ethereum hacia una wallet en Solana.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto a transferir |
| `source_address` | string | ✅ | Dirección de la wallet crypto de origen (ej: `0x3f5CE...`) |
| `source_network` | string | ✅ | Red blockchain de origen (ethereum, tron, solana, etc.) |
| `source_currency` | string | ✅ | Moneda de origen (usdt, usdc, etc.) |
| `destination_address` | string | ✅ | Dirección de la wallet crypto de destino |
| `destination_network` | string | ✅ | Red blockchain de destino |
| `destination_currency` | string | ✅ | Moneda de destino (usdt, usdc, etc.) |
| `business_purpose` | string | ✅ | Motivo del pago |
| `supporting_document_url` | string | ❌ | Documento de respaldo |

> **Nota:** Las direcciones NO provienen de ninguna tabla — el usuario las escribe/pega directamente. Esto permite enviar a cualquier wallet (Binance, MetaMask, TrustWallet, cold wallets, etc.) sin registro previo.

#### Frontend — Pantalla de Revisión (pre-confirmación)

El frontend muestra resumen antes de confirmar:
- Origen: `0x3f5C...E9aF` (Ethereum, USDT)
- Destino: `9kV3Z...UmCs` (Solana, USDC)
- Monto: 500.00 USDT
- Fee estimado: $2.50
- Monto neto: 497.50

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/interbank
   body: { flow_type: "wallet_to_wallet", amount: 500,
           source_address: "0x3f5CE...", source_network: "ethereum", source_currency: "usdt",
           destination_address: "9kV3Z...", destination_network: "solana", destination_currency: "usdc",
           business_purpose: "Transferencia entre mis wallets" }

2. 🤖 Backend:
   - Valida perfil verificado (getVerifiedProfile)
   - Calcula fee vía FeesService.calculateFee(userId, "interbank_w2w", "bridge", amount)
   - Crea payment_order con status = "created"
   - Guarda source_address, source_network, destination_address, destination_network en la orden

3. 🔗 Backend llama Bridge Transfer API:
   POST /v0/transfers
   {
     "on_behalf_of": "<bridge_customer_id>",
     "source": {
       "payment_rail": "ethereum",
       "currency": "usdt",
       "from_address": "0x3f5CE..."
     },
     "destination": {
       "payment_rail": "solana",
       "currency": "usdc",
       "to_address": "9kV3Z..."
     },
     "amount": "500.00"
   }

4. 🔗 Bridge responde con source_deposit_instructions:
   Bridge devuelve UNA DIRECCIÓN INTERMEDIARIA a la que el usuario debe enviar
   sus fondos desde su wallet de origen. Ejemplo:
   {
     "id": "transfer_abc123",
     "source_deposit_instructions": {
       "payment_rail": "ethereum",
       "currency": "usdt",
       "to_address": "0xBRIDGE_INTERMEDIARY_ADDRESS...",
       "amount": "500.00"
     }
   }

5. 🤖 Backend guarda bridge_transfer_id y source_deposit_instructions
   - Actualiza payment_order.bridge_transfer_id
   - Actualiza payment_order.bridge_source_deposit_instructions (jsonb)
   - Estado cambia a → "waiting_deposit"

6. 🧑 Frontend muestra instrucciones al usuario:
   "Envía 500 USDT a la dirección 0xBRIDGE... en la red Ethereum"
   (Esta es la dirección intermediaria de Bridge, NO el destino final)

7. 🧑 El usuario abre su wallet (MetaMask, Binance, etc.) y envía USDT
   a la dirección intermediaria de Bridge

8. 🔗 Bridge detecta el depósito, ejecuta la conversión/envío y dispara webhooks:
   - transfer.payment_processed → Bridge recibió los fondos
   - transfer.complete → Bridge envió al destino final
   - Estado cambia a → "completed"
   - El dinero NUNCA pasa por la wallet Bridge del usuario ni altera su balance en Guira
```

#### Datos que se almacenan en `payment_orders` para este flujo

```json
{
  "flow_type": "wallet_to_wallet",
  "flow_category": "interbank",
  "requires_psav": false,
  "source_type": "crypto_external",
  "source_currency": "USDT",
  "source_address": "0x3f5CE...",
  "source_network": "ethereum",
  "destination_type": "crypto_external",
  "destination_currency": "USDC",
  "destination_address": "9kV3Z...",
  "destination_network": "solana",
  "amount_source": 500.00,
  "fee_amount": 2.50,
  "net_amount": 497.50,
  "bridge_transfer_id": "transfer_abc123",
  "bridge_source_deposit_instructions": { "to_address": "0xBRIDGE...", ... },
  "status": "waiting_deposit"
}
```

---

### 1.3 `bolivia_to_wallet` — Bolivia → Wallet Externa (Mediado por PSAV)

**Propósito:** El usuario envía BOB y el destino final es una wallet cripto externa (no Bridge).

> Flujo idéntico a `1.1` en estructura de estados, pero el destino es una **dirección de wallet** en vez de cuenta bancaria. El PSAV convierte BOB → Crypto y envía a la dirección proporcionada.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en BOB |
| `destination_address` | string | ✅ | Dirección de wallet destino (ej: 0x..., bc1...) |
| `destination_network` | string | ✅ | Red blockchain (ethereum, solana, tron, etc.) |
| `destination_currency` | string | ✅ | Moneda destino (usdt, usdc, btc) |
| `business_purpose` | string | ✅ | Motivo |
| `supporting_document_url` | string | ❌ | Documento de respaldo |

#### Secuencia: Misma que 1.1 pero:
- El PSAV envía crypto a la `destination_address` en lugar de hacer un wire/ach
- El `tx_hash` será un hash de transacción on-chain
- `destination_type = "crypto_external"`

---

### 1.4 `world_to_bolivia` — Fiat Exterior → Bolivia (Mediado por PSAV)

**Propósito:** El usuario deposita fiat (USD) desde el exterior y recibe BOB en su cuenta bancaria nacional boliviana.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en USD a enviar |
| `destination_bank_name` | string | ✅ | Nombre del banco nacional (BNB, BCP, etc.) |
| `destination_account_number` | string | ✅ | Número de cuenta bancaria boliviana |
| `destination_account_holder` | string | ✅ | Titular de la cuenta |
| `destination_qr_url` | string | ❌ | QR de pago alternativo (imagen) |
| `business_purpose` | string | ✅ | Motivo |

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/interbank
   body: { flow_type: "world_to_bolivia", amount, destination_bank_name, 
           destination_account_number, ... }

2. 🤖 Backend:
   - Valida perfil
   - Calcula fee y tipo de cambio USD → BOB
   - Crea payment_order con status = "created"
   - Busca cuenta virtual del PSAV en USD para recibir el depósito
   - Estado → "waiting_deposit"
   - Retorna datos de la cuenta del PSAV para que el usuario deposite

3. 🧑 Usuario deposita USD en la cuenta del PSAV (vía wire/ach/SEPA)

4. 🧑 POST /payment-orders/:id/confirm-deposit
   body: { deposit_proof_url }
   - Estado → "deposit_received"

5. 👨‍💼 Staff verifica y aprueba → "processing"

6. 🏦 PSAV convierte USD → BOB y deposita en cuenta boliviana del usuario
   👨‍💼 POST /admin/payment-orders/:id/mark-sent
   body: { tx_hash, provider_reference }
   - Estado → "sent"

7. 👨‍💼 POST /admin/payment-orders/:id/complete
   body: { receipt_url }
   - Estado → "completed"
```

---

### 1.5 `world_to_wallet` — Fiat Exterior → Wallet Bridge (Vía Virtual Account)

**Propósito:** El usuario deposita USD a su wallet Bridge a través de su cuenta virtual existente.

> **Prerrequisito:** El usuario debe tener una **Virtual Account (VA)** activa con destino a su wallet Bridge. La VA proporciona una cuenta bancaria en USD donde el usuario puede recibir depósitos.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto estimado |
| `virtual_account_id` | uuid | ✅ | VA del usuario (previamente creada) |

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/interbank
   body: { flow_type: "world_to_wallet", amount, virtual_account_id }

2. 🤖 Backend:
   - Valida que la VA exista y esté activa
   - Obtiene source_deposit_instructions de la VA (almacenado en bridge_virtual_accounts)
   - Crea payment_order con status = "created"
   - Estado → "waiting_deposit"
   - Retorna las instrucciones bancarias de la VA al frontend

3. 🧑 Frontend muestra: bank_name, account_number, routing_number, beneficiary_name
   (datos previamente almacenados de Bridge)

4. 🧑 Usuario deposita USD en la cuenta de la VA

5. 🔗 Bridge webhook: virtual_account.funds_received
   - WebhooksService.handleFundsReceived() procesa automáticamente
   - Estado → "completed"
   - Se crea ledger_entry (credit, settled)
   - Se envía notificación
```

---

## 🔷 Servicio 2: Movimientos de Wallet Bridge

> En estos flujos el dinero ENTRA o SALE de la wallet custodiada por Bridge para el usuario.

---

### 2.1 `fiat_bo_to_bridge_wallet` — Fiat(BO) → Wallet Bridge (Mediado por PSAV)

**Propósito:** El usuario deposita BOB y los fondos llegan a su wallet Bridge en USDC/USDT.

> Bridge **no tiene rail directo** para recibir bolivianos. Se requiere el PSAV como intermediario: el usuario paga en BOB → el PSAV convierte a crypto → deposita en la wallet Bridge del usuario.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en BOB |
| `wallet_id` | uuid | ✅ | Wallet Bridge destino del usuario |

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/wallet-ramp
   body: { flow_type: "fiat_bo_to_bridge_wallet", amount, wallet_id }

2. 🤖 Backend:
   - Valida perfil y wallet
   - Calcula fee y tipo de cambio BOB → USD
   - Crea payment_order con status = "created"
   - Busca datos del PSAV para depósito en BOB
   - Estado → "waiting_deposit"
   - Retorna QR/cuenta del PSAV

3. 🧑 Usuario deposita BOB en cuenta del PSAV

4. 🧑 POST /payment-orders/:id/confirm-deposit
   body: { deposit_proof_url }
   - Estado → "deposit_received"

5. 👨‍💼 Staff verifica → "processing"

6. 🏦 PSAV convierte BOB → USDC y deposita en wallet Bridge del usuario
   👨‍💼 POST /admin/payment-orders/:id/mark-sent
   body: { tx_hash }
   - Estado → "sent"
   - tx_hash es el hash on-chain de la transferencia crypto al wallet Bridge

7. 👨‍💼 POST /admin/payment-orders/:id/complete
   body: { receipt_url }
   - Estado → "completed"
   - Se crea ledger_entry (credit, settled) en la wallet del usuario
   - Se envía notificación
```

---

### 2.2 `crypto_to_bridge_wallet` — Crypto(USDT) → Wallet Bridge (Vía Bridge Transfer)

**Propósito:** El usuario envía USDT desde una wallet externa a su wallet Bridge.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en USDT |
| `source_network` | string | ✅ | Red de origen (ethereum, tron, solana, etc.) |
| `source_address` | string | ✅ | Dirección de la wallet desde la cual se envía |
| `wallet_id` | uuid | ✅ | Wallet Bridge destino |

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/wallet-ramp
   body: { flow_type: "crypto_to_bridge_wallet", amount, source_network, source_address, wallet_id }

2. 🤖 Backend:
   - Valida perfil y wallet
   - Crea payment_order con status = "created"

3. 🔗 Backend llama Bridge Transfer API:
   POST /v0/transfers
   {
     "on_behalf_of": "<bridge_customer_id>",
     "source": {
       "payment_rail": "<source_network>",
       "currency": "usdt",
       "from_address": "<source_address>"
     },
     "destination": {
       "payment_rail": "<wallet_bridge_network>",
       "currency": "usdc",
       "to_address": "<wallet_bridge_address>"
     },
     "amount": "500.00"
   }

4. 🔗 Bridge responde con source_deposit_instructions:
   - Contiene la dirección y red a la que el usuario debe enviar sus USDT

5. 🤖 Backend guarda instrucciones y bridge_transfer_id
   - Estado → "waiting_deposit"
   - Frontend muestra: dirección de depósito, red, monto exacto

6. 🧑 Usuario envía USDT a la dirección indicada

7. 🔗 Bridge webhook: transfer.complete
   - Estado → "completed"
   - Backend crea ledger_entry (credit, settled)
   - Se envía notificación
```

---

### 2.3 `fiat_us_to_bridge_wallet` — Fiat(US) → Wallet Bridge (Vía Virtual Account)

**Propósito:** El usuario deposita USD desde una cuenta bancaria en EE.UU. y los fondos llegan a su wallet Bridge.

> **Prerrequisito:** El usuario debe crear una **Virtual Account** con `destination_wallet_id` apuntando a su wallet Bridge. Esto genera una cuenta bancaria en USD exclusiva para este usuario.

#### Frontend

Este flujo **no requiere formulario extenso**. El usuario:
1. Selecciona o crea su Virtual Account con destino a wallet Bridge
2. Ve las instrucciones bancarias (bank_name, routing_number, account_number)
3. Deposita USD desde su banco en EE.UU.

#### Secuencia Backend

```
1. El usuario ya tiene su VA creada previamente (POST /bridge/virtual-accounts)

2. 🧑 POST /payment-orders/wallet-ramp
   body: { flow_type: "fiat_us_to_bridge_wallet", amount, virtual_account_id }

3. 🤖 Backend:
   - Verifica que la VA exista, esté activa, y apunte a wallet Bridge del usuario
   - Crea payment_order con status = "created"
   - Estado → "waiting_deposit"
   - Retorna instrucciones bancarias de la VA

4. 🧑 Usuario deposita USD en la cuenta de la VA

5. 🔗 Bridge webhook: virtual_account.funds_received
   - WebhooksService existente procesa el depósito
   - Estado → "completed"
   - Ledger entry creado automáticamente
```

---

### 2.4 `bridge_wallet_to_fiat_bo` — Wallet Bridge → Fiat(BO) (Mediado por PSAV)

**Propósito:** El usuario retira fondos de su wallet Bridge para recibir BOB en su cuenta bancaria boliviana.

> Bridge **no puede enviar directamente a cuentas bolivianas**. El usuario envía crypto de su wallet Bridge al PSAV, y el PSAV deposita BOB en la cuenta nacional del usuario.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en USDC/USDT a convertir |
| `wallet_id` | uuid | ✅ | Wallet Bridge fuente |
| `destination_bank_name` | string | ✅ | Banco boliviano (BNB, BCP, etc.) |
| `destination_account_number` | string | ✅ | Número de cuenta boliviana |
| `destination_account_holder` | string | ✅ | Titular |
| `destination_qr_url` | string | ❌ | QR de pago alternativo |

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/wallet-ramp
   body: { flow_type: "bridge_wallet_to_fiat_bo", amount, wallet_id,
           destination_bank_name, destination_account_number, ... }

2. 🤖 Backend:
   - Valida perfil, wallet, saldo disponible
   - Reserva saldo (reserve_balance RPC)
   - Calcula fee y tipo de cambio USDC → BOB
   - Crea payment_order con status = "created"
   - Busca dirección crypto del PSAV para recibir los fondos
   - Estado → "waiting_deposit"
   - Retorna dirección crypto del PSAV al frontend

3. 🧑 Frontend muestra:
   - Dirección crypto del PSAV
   - Red (ethereum, tron, etc.)
   - Monto exacto en USDC a enviar

4. 🧑 Usuario envía USDC desde su wallet Bridge a la dirección del PSAV

5. 🧑 POST /payment-orders/:id/confirm-deposit
   body: { deposit_proof_url, tx_hash_source }
   - Estado → "deposit_received"

6. 👨‍💼 Staff verifica la recepción del crypto → "processing"

7. 🏦 PSAV convierte USDC → BOB y deposita en cuenta boliviana
   👨‍💼 POST /admin/payment-orders/:id/mark-sent
   body: { tx_hash, provider_reference }
   - Estado → "sent"

8. 👨‍💼 POST /admin/payment-orders/:id/complete
   body: { receipt_url }
   - Estado → "completed"
   - Ledger entry (debit, settled) ya que los fondos salieron de la wallet
   - Se libera saldo reservado
```

---

### 2.5 `bridge_wallet_to_crypto` — Wallet Bridge → Crypto(USDT) (Vía Bridge Transfer)

**Propósito:** El usuario retira USDC de su wallet Bridge hacia una dirección crypto externa.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en USDC |
| `wallet_id` | uuid | ✅ | Wallet Bridge fuente |
| `destination_address` | string | ✅ | Dirección crypto destino |
| `destination_network` | string | ✅ | Red destino (ethereum, tron, solana) |
| `destination_currency` | string | ✅ | Moneda destino (usdt, usdc) |

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/wallet-ramp
   body: { flow_type: "bridge_wallet_to_crypto", amount, wallet_id,
           destination_address, destination_network, destination_currency }

2. 🤖 Backend:
   - Valida perfil, wallet, saldo
   - Reserva saldo
   - Calcula fee
   - Crea payment_order con status = "created"

3. 🔗 Backend llama Bridge Transfer API:
   POST /v0/transfers
   {
     "on_behalf_of": "<bridge_customer_id>",
     "source": {
       "payment_rail": "<wallet_network>",
       "currency": "usdc",
       "from_address": "<wallet_bridge_address>"
     },
     "destination": {
       "payment_rail": "<destination_network>",
       "currency": "<destination_currency>",
       "to_address": "<destination_address>"
     },
     "amount": "500.00"
   }

4. 🔗 Bridge responde con source_deposit_instructions:
   - Instrucciones de depósito (dirección donde el usuario debe enviar)

5. 🤖 Estado → "waiting_deposit"
   - Frontend muestra instrucciones de Bridge

6. 🔗 Bridge webhook: transfer.complete
   - Estado → "completed"
   - Ledger entry (debit, settled)
   - Saldo reservado se libera
```

---

### 2.6 `bridge_wallet_to_fiat_us` — Wallet Bridge → Fiat(US) (Vía Bridge Transfer)

**Propósito:** El usuario retira fondos de su wallet Bridge y los recibe en una cuenta bancaria en USD.

#### Frontend — Formulario

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `amount` | number | ✅ | Monto en USDC |
| `wallet_id` | uuid | ✅ | Wallet Bridge fuente |
| `external_account_id` | uuid | ✅ | Cuenta externa registrada en Bridge (ACH/Wire) |
| `business_purpose` | string | ✅ | Motivo del retiro |
| `supporting_document_url` | string | ❌ | Documento de respaldo |

#### Secuencia Backend

```
1. 🧑 POST /payment-orders/wallet-ramp
   body: { flow_type: "bridge_wallet_to_fiat_us", amount, wallet_id,
           external_account_id, business_purpose }

2. 🤖 Backend:
   - Valida perfil, wallet, saldo, cuenta externa activa
   - Reserva saldo
   - Calcula fee
   - Crea payment_order con status = "created"

3. 🔗 Backend llama Bridge Transfer API:
   POST /v0/transfers
   {
     "on_behalf_of": "<bridge_customer_id>",
     "source": {
       "payment_rail": "<wallet_network>",
       "currency": "usdc",
       "from_address": "<wallet_bridge_address>"
     },
     "destination": {
       "payment_rail": "ach" | "wire",
       "currency": "usd",
       "external_account_id": "<bridge_external_account_id>"
     },
     "amount": "1000.00"
   }

4. 🔗 Bridge responde con source_deposit_instructions

5. 🤖 Estado → "waiting_deposit"
   - Frontend muestra instrucciones de Bridge

6. 🔗 Bridge webhooks:
   - transfer.payment_processed → estado intermedio
   - transfer.complete → Estado → "completed"
   - Ledger entry (debit, settled)
   - Certificado generado
```

---

## 🗄️ Esquema de Base de Datos

### Tabla: `payment_orders` (REQUIERE MODIFICACIÓN)

> ⚠️ La tabla `payment_orders` actual solo tiene campos básicos. Se requiere una extensión significativa.

| Columna | Tipo | Nullable | Default | Descripción |
|---------|------|:--------:|---------|-------------|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `user_id` | uuid | ❌ | - | FK → profiles.id |
| `wallet_id` | uuid | ✅ | - | FK → wallets.id (wallet involucrada, si aplica) |
| `flow_type` | text | ❌ | - | CHECK: enum de los 11 flujos |
| `flow_category` | text | ❌ | - | CHECK: `'interbank'` \| `'wallet_ramp'` |
| `requires_psav` | boolean | ❌ | false | Si requiere intermediario manual |
| **— Source —** |
| `source_type` | text | ❌ | - | CHECK: `'fiat_bo'` \| `'fiat_us'` \| `'crypto_external'` \| `'bridge_wallet'` \| `'bridge_virtual_account'` |
| `source_currency` | text | ❌ | - | Moneda origen (BOB, USD, USDT, USDC) |
| `source_reference_id` | text | ✅ | - | Referencia al recurso origen (VA, wallet, external_account) |
| `source_address` | text | ✅ | - | Dirección crypto de origen (solo wallet_to_wallet) |
| `source_network` | text | ✅ | - | Red blockchain de origen (solo wallet_to_wallet) |
| **— Destination —** |
| `destination_type` | text | ❌ | - | CHECK: `'fiat_bo'` \| `'fiat_us'` \| `'fiat_external'` \| `'crypto_external'` \| `'bridge_wallet'` |
| `destination_currency` | text | ❌ | - | Moneda destino |
| `external_account_id` | uuid | ✅ | - | FK → bridge_external_accounts.id |
| `destination_bank_name` | text | ✅ | - | Solo para destinos BO |
| `destination_account_number` | text | ✅ | - | Solo para destinos BO |
| `destination_account_holder` | text | ✅ | - | Titular de cuenta destino BO |
| `destination_qr_url` | text | ✅ | - | QR alternativo para destino BO |
| `destination_address` | text | ✅ | - | Dirección crypto para destinos crypto |
| `destination_network` | text | ✅ | - | Red blockchain si aplica |
| **— Montos —** |
| `amount_source` | numeric(18,2) | ❌ | - | Monto en moneda origen |
| `exchange_rate` | numeric(12,6) | ✅ | - | Tipo de cambio aplicado |
| `amount_destination` | numeric(18,2) | ✅ | - | Monto en moneda destino (post conversión) |
| `fee_amount` | numeric(18,2) | ❌ | 0 | Comisión calculada |
| `net_amount` | numeric(18,2) | ❌ | - | Monto neto (después de fee) |
| **— PSAV / Admin —** |
| `psav_deposit_instructions` | jsonb | ✅ | - | Instrucciones de depósito mostradas al usuario (QR, cuenta, etc.) |
| `deposit_proof_url` | text | ✅ | - | Comprobante subido por el usuario |
| `approved_by` | uuid | ✅ | - | FK → profiles.id (staff que aprobó) |
| `approved_at` | timestamptz | ✅ | - | Fecha de aprobación |
| `exchange_rate_applied` | numeric(12,6) | ✅ | - | TC confirmado por staff (puede diferir del estimado) |
| **— Bridge —** |
| `bridge_transfer_id` | text | ✅ | - | ID del transfer en Bridge |
| `bridge_source_deposit_instructions` | jsonb | ✅ | - | Instrucciones que devuelve Bridge |
| `bridge_event_id` | text | ✅ | - | ID del webhook event de Bridge |
| **— Tracking —** |
| `tx_hash` | text | ✅ | - | Hash de transacción (on-chain o referencia bancaria) |
| `provider_reference` | text | ✅ | - | Referencia interna del PSAV |
| `receipt_url` | text | ✅ | - | Factura/recibo del PSAV |
| **— Metadatos —** |
| `business_purpose` | text | ✅ | - | Motivo del pago |
| `supporting_document_url` | text | ✅ | - | Documento de respaldo |
| `notes` | text | ✅ | - | Notas generales |
| `sender_name` | text | ✅ | - | Nombre del remitente (para depósitos entrantes via webhook) |
| `status` | text | ❌ | 'created' | CHECK: ver estados abajo |
| `failure_reason` | text | ✅ | - | Motivo del fallo |
| `created_at` | timestamptz | ❌ | now() | - |
| `updated_at` | timestamptz | ❌ | now() | - |
| `completed_at` | timestamptz | ✅ | - | - |

#### CHECK constraint para `status`:
```sql
CHECK (status IN (
  'created',           -- Orden creada, pendiente de depósito
  'waiting_deposit',   -- Esperando depósito del usuario
  'deposit_received',  -- Depósito confirmado, pendiente de revisión
  'processing',        -- Staff aprobó, PSAV en proceso
  'sent',              -- PSAV envió los fondos
  'completed',         -- Flujo completado exitosamente
  'failed',            -- Falló en cualquier paso
  'swept_external',    -- Fondos reenviados a wallet externa (VA external sweep)
  'cancelled'          -- Cancelado por el usuario o admin
))
```

#### CHECK constraint para `flow_type`:
```sql
CHECK (flow_type IN (
  'bolivia_to_world',
  'wallet_to_wallet',
  'bolivia_to_wallet',
  'world_to_bolivia',
  'world_to_wallet',
  'fiat_bo_to_bridge_wallet',
  'crypto_to_bridge_wallet',
  'fiat_us_to_bridge_wallet',
  'bridge_wallet_to_fiat_bo',
  'bridge_wallet_to_crypto',
  'bridge_wallet_to_fiat_us'
))
```

---

### Tabla Nueva: `psav_accounts` (Cuentas del Intermediario)

> Almacena las cuentas/wallets del PSAV que se muestran al usuario para depósitos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|:--------:|-------------|
| `id` | uuid | ❌ | PK |
| `name` | text | ❌ | Nombre identificador (ej: "PSAV Bolivia - BNB") |
| `type` | text | ❌ | CHECK: `'bank_bo'` \| `'bank_us'` \| `'crypto'` |
| `currency` | text | ❌ | BOB, USD, USDT, USDC |
| `bank_name` | text | ✅ | Nombre del banco |
| `account_number` | text | ✅ | Número de cuenta |
| `account_holder` | text | ✅ | Titular de la cuenta |
| `qr_url` | text | ✅ | URL de imagen QR |
| `crypto_address` | text | ✅ | Dirección crypto del PSAV |
| `crypto_network` | text | ✅ | Red blockchain |
| `is_active` | boolean | ❌ | true |
| `metadata` | jsonb | ✅ | Datos adicionales |
| `created_at` | timestamptz | ❌ | now() |

---

### Tabla Nueva: `exchange_rates_config`

> Tipos de cambio configurables por el admin.

| Columna | Tipo | Nullable | Descripción |
|---------|------|:--------:|-------------|
| `id` | uuid | ❌ | PK |
| `pair` | text | ❌ | UNIQUE: `'BOB_USD'`, `'USD_BOB'`, etc. |
| `rate` | numeric(12,6) | ❌ | Tipo de cambio actual |
| `spread_percent` | numeric(5,2) | ✅ | Spread aplicado |
| `updated_by` | uuid | ✅ | FK → profiles.id |
| `updated_at` | timestamptz | ❌ | now() |

---

## 🔌 Endpoints API Propuestos

### Endpoints de Usuario

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/payment-orders/interbank` | Crear orden interbancaria (flujos 1.x) |
| `POST` | `/payment-orders/wallet-ramp` | Crear orden de rampa (flujos 2.x) |
| `GET` | `/payment-orders` | Listar mis órdenes (paginado, filtros) |
| `GET` | `/payment-orders/:id` | Detalle de una orden |
| `POST` | `/payment-orders/:id/confirm-deposit` | Confirmar depósito (sube comprobante) |
| `POST` | `/payment-orders/:id/cancel` | Cancelar orden (solo en `created` o `waiting_deposit`) |
| `GET` | `/payment-orders/exchange-rates` | Tipos de cambio vigentes |

### Endpoints de Admin

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/admin/payment-orders` | Listar todas las órdenes (filtros por estado, flujo) |
| `GET` | `/admin/payment-orders/:id` | Detalle completo |
| `POST` | `/admin/payment-orders/:id/approve` | Aprobar y pasar a processing |
| `POST` | `/admin/payment-orders/:id/mark-sent` | Marcar como enviado (hash, referencia) |
| `POST` | `/admin/payment-orders/:id/complete` | Marcar como completado (factura/recibo) |
| `POST` | `/admin/payment-orders/:id/fail` | Marcar como fallido (motivo) |
| `GET` | `/admin/psav-accounts` | Listar cuentas PSAV |
| `POST` | `/admin/psav-accounts` | Crear cuenta PSAV |
| `PUT` | `/admin/psav-accounts/:id` | Actualizar cuenta PSAV |
| `GET` | `/admin/exchange-rates` | Ver tipos de cambio |
| `PUT` | `/admin/exchange-rates/:pair` | Actualizar tipo de cambio |

---

## ⚙️ Impacto en el Backend Actual

### Módulos Existentes Afectados

| Módulo | Impacto | Detalle |
|--------|---------|--------|
| `BridgeService` | 🟠 Medio | Se reutiiza la lógica de Transfer API. Necesita métodos expuestos o refactorizados para ser consumidos por `PaymentOrderService` |
| `WebhooksService` | 🟠 Medio | Los handlers de `virtual_account.funds_received` y `transfer.complete` deben actualizar `payment_orders` además de los registros actuales |
| `LedgerService` | 🟢 Bajo | Se reutiliza `createEntry()` y `settleEntry()` tal cual |
| `FeesService` | 🟡 Medio | Nuevos `operation_type` necesarios en `fees_config`: `interbank_bo_out`, `interbank_bo_in`, `ramp_on_bo`, `ramp_off_bo`, etc. |
| `SuppliersService` | 🟢 Bajo | Sin cambios — los suppliers se usan como registros del usuario, no como destinos de payment_orders |
| `AdminService` | 🔴 Alto | Nuevos endpoints de gestión de órdenes PSAV, cuentas PSAV, tipos de cambio |

### Tablas de DB — Cambios Requeridos

| Tabla | Acción | Detalle |
|-------|--------|--------|
| `payment_orders` | **ALTER** | Agregar todas las columnas nuevas documentadas arriba |
| `psav_accounts` | **CREATE** | Nueva tabla para cuentas del intermediario |
| `exchange_rates_config` | **CREATE** | Nueva tabla para tipos de cambio |
| `fees_config` | **INSERT** | Nuevos registros para operation_types de interbank y ramp |
| `bridge_transfers` | Sin cambios | Se usa tal cual |
| `ledger_entries` | Sin cambios | Se usa tal cual |

### Archivos Nuevos Necesarios

```
src/application/payment-orders/
  ├── payment-orders.module.ts
  ├── payment-orders.controller.ts      # Endpoints usuario + admin
  ├── payment-orders.service.ts         # Orquestador principal
  ├── interbank.service.ts              # Lógica flujos 1.x
  ├── wallet-ramp.service.ts            # Lógica flujos 2.x
  └── dto/
      ├── create-interbank-order.dto.ts
      ├── create-wallet-ramp-order.dto.ts
      ├── confirm-deposit.dto.ts
      └── admin-order-action.dto.ts

src/application/psav/
  ├── psav.module.ts
  ├── psav.controller.ts
  ├── psav.service.ts
  └── dto/
      └── create-psav-account.dto.ts

src/application/exchange-rates/
  ├── exchange-rates.module.ts
  ├── exchange-rates.controller.ts
  ├── exchange-rates.service.ts
  └── dto/
      └── update-rate.dto.ts
```

---

## 🔐 Consideraciones de Seguridad

1. **Compliance:** Los flujos con PSAV requieren `compliance_reviews` para montos >= PAYOUT_REVIEW_THRESHOLD
2. **Rate Limiting:** Máximo 5 órdenes por hora por usuario
3. **Validación de Propiedad:** Toda orden solo es accesible por su propietario excepto para admin
4. **Audit Trail:** Cada cambio de estado genera un `audit_logs` entry
5. **Saldo Reservado:** Para flujos de salida de wallet Bridge, se reserva saldo al crear la orden y se libera al completar/fallar
6. **Idempotencia:** Las llamadas a Bridge API usan `Idempotency-Key` derivada del `payment_order.id`

---

## 📌 Nota Final: Flujos PSAV vs Bridge

```
┌─────────────────────────────────────────────────────────────────┐
│                     REGLA DE ORO                                │
│                                                                 │
│  Si involucra BOLIVIANOS (BOB) → requiere PSAV (manual)        │
│  Si es USD/Crypto ↔ USD/Crypto → puede usar Bridge (auto)      │
│                                                                 │
│  Excepciones:                                                   │
│  - 1.2 wallet_to_wallet: Aunque no toca BOB, usa Bridge        │
│    Transfer de external → external                              │
│  - 1.4 world_to_bolivia: Entra USD pero sale BOB → PSAV        │
│  - 2.4 bridge_wallet_to_fiat_bo: Entra USDC pero sale BOB      │
│    → PSAV                                                       │
└─────────────────────────────────────────────────────────────────┘
```