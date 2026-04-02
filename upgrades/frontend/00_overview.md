# Frontend — Guía Completa del Backend

> **Base URL:** `http://localhost:3000` (dev) / `https://api.guira.app` (prod)  
> **Autenticación:** Bearer Token JWT de Supabase en header `Authorization: Bearer <token>`  
> **Guard Global:** Todas las rutas requieren auth excepto las marcadas como `@Public()`  
> **Roles:** `client`, `staff`, `admin`, `super_admin`

---

## Módulos del Backend

| # | Módulo | Prefijo Ruta | Descripción |
|---|--------|-------------|-------------|
| 1 | **Auth** | `/auth` | Registro, login, refresh, logout |
| 2 | **Profiles** | `/profiles` + `/admin/profiles` | Perfil usuario, avatar, onboarding status |
| 3 | **Onboarding** | `/onboarding` | KYC (persona) y KYB (empresa), documentos, ToS |
| 4 | **Compliance** | `/compliance` + `/admin/compliance` + `/admin/users` | Reviews, documentos, límites de transacción |
| 5 | **Bridge** | `/bridge` + `/admin/bridge` | Virtual Accounts, External Accounts, Payouts, Transfers, Liquidation Addresses |
| 6 | **Wallets** | `/wallets` + `/admin/wallets` | Wallets, balances, payin routes |
| 7 | **Ledger** | `/ledger` + `/admin/ledger` | Historial de movimientos, ajustes manuales |
| 8 | **Payment Orders** | `/payment-orders` + `/admin/payment-orders` | 11 flujos financieros, PSAV, tipos de cambio |
| 9 | **Fees** | `/fees` + `/admin/fees` | Tarifas públicas, overrides VIP |
| 10 | **Notifications** | `/notifications` | Notificaciones del usuario |
| 11 | **Support** | `/support/tickets` + `/admin/support/tickets` | Tickets de soporte |
| 12 | **Suppliers** | `/suppliers` | Proveedores del usuario |
| 13 | **Admin Panel** | `/settings` + `/activity` + `/admin` | Settings, audit logs, reconciliación |
| 14 | **Webhooks** | `/webhooks` | Receptor de webhooks Bridge (interno) |

---

## Documentos por Módulo

| Archivo | Contenido |
|---------|-----------|
| [01_auth.md](./01_auth.md) | Registro, login, refresh, logout |
| [02_profiles.md](./02_profiles.md) | Perfil de usuario y admin de perfiles |
| [03_onboarding.md](./03_onboarding.md) | Flujos KYC y KYB completos |
| [04_compliance.md](./04_compliance.md) | Documentos, reviews, límites |
| [05_bridge.md](./05_bridge.md) | Virtual Accounts, External Accounts, Payouts, Transfers |
| [06_wallets_ledger.md](./06_wallets_ledger.md) | Wallets, balances, historial de movimientos |
| [07_payment_orders.md](./07_payment_orders.md) | 11 flujos financieros con máquina de estados |
| [08_fees.md](./08_fees.md) | Tarifas y overrides |
| [09_notifications_support.md](./09_notifications_support.md) | Notificaciones, tickets de soporte |
| [10_admin_panel.md](./10_admin_panel.md) | Settings, audit logs, reconciliación, proveedores |

---

## Roles y Permisos

| Recurso | client | staff | admin | super_admin |
|---------|--------|-------|-------|-------------|
| Auth (registro, login) | ✅ | ✅ | ✅ | ✅ |
| Perfil propio | ✅ | ✅ | ✅ | ✅ |
| Onboarding KYC/KYB | ✅ | ✅ | ✅ | ✅ |
| Bridge (VA, External, Payouts) | ✅ | ✅ | ✅ | ✅ |
| Payment Orders (crear, cancelar) | ✅ | ✅ | ✅ | ✅ |
| Listar perfiles ajenos | ❌ | ✅ | ✅ | ✅ |
| Compliance reviews | ❌ | ✅ | ✅ | ✅ |
| Aprobar payouts | ❌ | ✅ | ✅ | ✅ |
| Aprobar payment orders | ❌ | ✅ | ✅ | ✅ |
| Congelar cuentas | ❌ | ❌ | ✅ | ✅ |
| Crear fees/overrides | ❌ | ❌ | ✅ | ✅ |
| Ajustar balances | ❌ | ❌ | ✅ | ✅ |
| Crear settings | ❌ | ❌ | ❌ | ✅ |
| Reconciliación financiera | ❌ | ❌ | ✅ | ✅ |

---

## Flujo General del Usuario (Vista de Alto Nivel)

```
1. REGISTRO           POST /auth/register
        ↓
2. ONBOARDING         POST /onboarding/kyc/person → documents → tos → submit
        ↓
3. APROBACIÓN         (admin aprueba vía /admin/compliance)
        ↓
4. WALLET CREADA      (automático al aprobar KYC)
        ↓
5. FONDEAR WALLET     POST /payment-orders/wallet-ramp (on-ramp)
        ↓
6. OPERAR             POST /payment-orders/interbank o /bridge/payouts
        ↓
7. RETIRAR            POST /payment-orders/wallet-ramp (off-ramp)
```
