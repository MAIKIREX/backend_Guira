# Plan de Implementación — Payment Orders Module

> **Documento maestro** — Índice y secuencia de ejecución

---

## 📁 Estructura del Plan

| # | Archivo | Fase | Descripción |
|---|---------|------|-------------|
| 01 | `01_database_migration.md` | DB | Migración de `payment_orders`, creación de `psav_accounts`, `exchange_rates_config`, seed de `fees_config` |
| 02 | `02_module_structure.md` | Backend | Módulo NestJS: `PaymentOrdersModule`, servicios, controladores, DTOs |
| 03 | `03_psav_and_exchange_rates.md` | Backend | Módulos auxiliares: `PsavModule`, `ExchangeRatesModule` |
| 04 | `04_webhook_integration.md` | Backend | Modificaciones a `WebhooksService` para vincular con `payment_orders` |
| 05 | `05_admin_endpoints.md` | Backend | Endpoints admin para gestión de órdenes PSAV, cuentas PSAV y tipos de cambio |

---

## 🔢 Secuencia de Ejecución

```
Fase 1: Database Migration (01)
   └─ ALTER payment_orders
   └─ CREATE psav_accounts
   └─ CREATE exchange_rates_config
   └─ INSERT fees_config (nuevos operation_types)
   └─ RLS policies
   └─ Triggers updated_at

Fase 2: Módulos Auxiliares (03)
   └─ PsavService + PsavController
   └─ ExchangeRatesService + ExchangeRatesController

Fase 3: Payment Orders Module (02)
   └─ PaymentOrdersService (orquestador)
   └─ InterbankService (flujos 1.x)
   └─ WalletRampService (flujos 2.x)
   └─ PaymentOrdersController (user + admin)
   └─ DTOs + validación

Fase 4: Webhook Integration (04)
   └─ Modificar WebhooksService.handleFundsReceived
   └─ Modificar WebhooksService.handleTransferComplete
   └─ Vincular webhooks con payment_orders

Fase 5: Admin Endpoints (05)
   └─ Endpoints de gestión de órdenes PSAV
   └─ Approve / mark-sent / complete / fail
   └─ Listados con filtros
```

---

## 📋 Estado Actual de la DB (Tabla `payment_orders`)

### Columnas existentes (16 columnas):

| Columna | Tipo | Nullable | Default |
|---------|------|:--------:|---------|
| `id` | uuid | ❌ | gen_random_uuid() |
| `user_id` | uuid | ❌ | - |
| `wallet_id` | uuid | ✅ | - |
| `payin_route_id` | uuid | ✅ | FK → payin_routes |
| `source_type` | text | ✅ | - |
| `source_reference_id` | text | ✅ | - |
| `amount` | numeric | ❌ | - |
| `fee_amount` | numeric | ✅ | 0 |
| `net_amount` | numeric | ✅ | - |
| `currency` | text | ❌ | - |
| `source_currency` | text | ✅ | - |
| `sender_name` | text | ✅ | - |
| `sender_bank_name` | text | ✅ | - |
| `deposit_message` | text | ✅ | - |
| `exchange_rate` | numeric | ✅ | - |
| `exchange_fee` | numeric | ✅ | - |
| `status` | text | ✅ | 'pending' |
| `bridge_event_id` | text | ✅ | - |
| `notes` | text | ✅ | - |
| `completed_at` | timestamptz | ✅ | - |
| `created_at` | timestamptz | ✅ | now() |

### CHECK actual de `status`:
```sql
status IN ('pending', 'processing', 'completed', 'failed', 'refunded')
```

### Foreign Keys existentes:
- `payment_orders_user_id_fkey` → `profiles.id`
- `payment_orders_wallet_id_fkey` → `wallets.id`
- `payment_orders_payin_route_id_fkey` → `payin_routes.id`

### Fees Config existentes (9 registros):
| operation_type | payment_rail | currency | fee_type | fee_percent | fee_fixed |
|---------------|-------------|----------|----------|------------|----------|
| deposit | wire | usd | percent | 1.00 | - |
| deposit | ach | usd | percent | 0.50 | - |
| deposit | sepa | eur | percent | 0.50 | - |
| deposit | spei | mxn | fixed | - | 5.00 |
| exchange | internal | usd | percent | 0.30 | - |
| payout | ach | usd | percent | 0.25 | - |
| payout | sepa | eur | percent | 0.50 | - |
| payout | spei | mxn | fixed | - | 8.00 |
| payout | wire | usd | percent | 0.75 | - |

---

## 🗂️ Archivos a Crear/Modificar

### Archivos NUEVOS (13 archivos)

```
src/application/payment-orders/
  ├── payment-orders.module.ts            # Módulo NestJS
  ├── payment-orders.controller.ts        # Endpoints usuario + admin
  ├── payment-orders.service.ts           # Orquestador principal
  ├── interbank.service.ts                # Lógica flujos 1.x
  ├── wallet-ramp.service.ts              # Lógica flujos 2.x
  └── dto/
      ├── create-interbank-order.dto.ts
      ├── create-wallet-ramp-order.dto.ts
      ├── confirm-deposit.dto.ts
      └── admin-order-action.dto.ts

src/application/psav/
  ├── psav.module.ts
  ├── psav.service.ts
  └── dto/
      └── psav-account.dto.ts

src/application/exchange-rates/
  ├── exchange-rates.module.ts
  ├── exchange-rates.service.ts
  └── dto/
      └── update-rate.dto.ts
```

### Archivos a MODIFICAR (4 archivos)

| Archivo | Cambio |
|---------|--------|
| `src/application/webhooks/webhooks.service.ts` | Vincular handlers existentes con `payment_orders` |
| `src/application/admin/admin.controller.ts` | Importar nuevos controladores admin |
| `src/application/admin/admin.module.ts` | Registrar nuevos módulos |
| `src/app.module.ts` | Importar `PaymentOrdersModule`, `PsavModule`, `ExchangeRatesModule` |
