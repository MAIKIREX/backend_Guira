# 🗺️ GUIRA BACKEND — PLAN MAESTRO DE IMPLEMENTACIÓN
> **Ingeniería Fullstack · Backend NestJS + Supabase + Bridge API**
> **Fecha:** 2026-03-28 | **Proyecto:** Guira v2 · `culyqtrtuxznkedohryg`

---

## 📊 ESTADO ACTUAL DEL PROYECTO

### ✅ Infraestructura Completada

| Componente | Estado | Notas |
|---|---|---|
| **Supabase (Guira v2)** | ✅ ACTIVO | `culyqtrtuxznkedohryg` — us-east-2 |
| **DB Schema** | ✅ COMPLETO | 35+ tablas con RLS habilitado |
| **NestJS App** | ✅ INICIALIZADO | `nest-base-backend`, estructura modular |
| **CoreModule** | ✅ LISTO | Config, Guards, Decorators, SupabaseModule |
| **SupabaseClient** | ✅ INYECTABLE | `service_role` para operaciones backend |

### ✅ Módulos NestJS con Estructura Base

| Módulo | Controller | Service | DTOs | Estado |
|---|---|---|---|---|
| `bridge` | ✅ | ✅ parcial | ✅ parcial | 🟡 Funcionalidad incompleta |
| `profiles` | ✅ | ✅ parcial | ✅ parcial | 🟡 Funcionalidad básica |
| `compliance` | ✅ estructura | ✅ vacío | ❌ | 🔴 Sin implementar |
| `wallets` | ✅ estructura | ✅ vacío | ❌ | 🔴 Sin implementar |
| `webhooks` | ✅ | ✅ parcial | N/A | 🟡 CRON existe, handlers incompletos |

### ✅ Tablas en Supabase (Public Schema — 35 tablas)

**Identidad:** `profiles`, `auth_rate_limits`  
**Onboarding:** `people`, `businesses`, `business_directors`, `business_ubos`, `kyc_applications`, `kyb_applications`, `documents`, `suppliers`  
**Compliance:** `compliance_reviews`, `compliance_review_comments`, `compliance_review_events`, `transaction_limits`  
**Core Financiero:** `wallets`, `balances`, `ledger_entries`, `payin_routes`, `payment_orders`, `payout_requests`, `fees_config`, `customer_fee_overrides`, `certificates`, `reconciliation_runs`  
**Bridge:** `bridge_virtual_accounts`, `bridge_virtual_account_events`, `bridge_external_accounts`, `bridge_transfers`, `bridge_liquidation_addresses`, `bridge_kyc_links`, `bridge_pull_jobs`, `webhook_events`  
**Sistema:** `audit_logs`, `activity_logs`, `notifications`, `support_tickets`, `app_settings`

### 🔴 Gaps Críticos Identificados

1. **Sin Triggers PostgreSQL** — `balances` no se actualiza automáticamente con `ledger_entries`
2. **Handlers de Webhooks incompletos** — referencias a columnas incorrectas (e.g. `va_id` vs `bridge_virtual_account_id`)
3. **BridgeService desincronizado** — usa columnas antiguas (`available_balance`, `amount_usd`, `payout_type`)
4. **Sin módulo de Onboarding** — KYC/KYB flow no está implementado en ningún servicio NestJS
5. **Sin módulo de Wallets funcional** — no crea wallets ni balances en Bridge post-KYC
6. **Sin módulo de Ledger** — movimientos financieros internos no gestionados
7. **Sin módulo de Compliance Admin** — el staff no tiene endpoints para revisar expedientes
8. **Sin módulo de Notificaciones** — no existe integración Supabase Realtime
9. **Sin Edge Functions** — los triggers de DB son necesarios para la inmutabilidad del ledger
10. **Sin pruebas** — ningún test implementado más allá de los autogenerados por NestJS

---

## 📁 ARQUITECTURA DE MÓDULOS OBJETIVO

```
src/
├── core/                           ← LISTO
│   ├── supabase/                   ← SupabaseModule (service_role)
│   ├── guards/                     ← JwtAuthGuard, RoleGuard
│   ├── decorators/                 ← @CurrentUser(), @Roles()
│   └── config/                     ← ConfigModule
│
└── application/
    ├── auth/                       ← [FASE 1] Registro, login, OTP, rate limiting
    ├── profiles/                   ← [FASE 1] CRUD perfil, estado onboarding
    ├── onboarding/                 ← [FASE 2] KYC, KYB, documentos, subida de archivos
    ├── compliance/                 ← [FASE 3] Reviews, eventos, comentarios (admin/staff)
    ├── wallets/                    ← [FASE 4] Wallets, balances, ledger
    ├── bridge/                     ← [FASE 4] Virtual Accounts, External Accounts, Transfers, Payouts
    ├── webhooks/                   ← [FASE 4] Sink + CRON Worker (refactor completo)
    ├── notifications/              ← [FASE 5] CRUD notificaciones, mark-as-read
    ├── admin/                      ← [FASE 5] Panel admin: settings, pull jobs, reconciliation
    └── support/                    ← [FASE 6] Tickets de soporte
```

---

## 📋 FASES DEL PLAN

| Fase | Nombre | Prioridad | Complejidad |
|---|---|---|---|
| **Fase 0** | Base: DB Triggers + Seed Data | 🔴 CRÍTICA | Media |
| **Fase 1** | Auth & Identidad | 🔴 CRÍTICA | Media |
| **Fase 2** | Onboarding KYC/KYB | 🔴 CRÍTICA | Alta |
| **Fase 3** | Core Financiero (Wallets + Ledger) | 🔴 CRÍTICA | Alta |
| **Fase 4** | Integración Bridge (Completa) | 🔴 CRÍTICA | Muy Alta |
| **Fase 5** | Webhooks + CRON Worker | 🔴 CRÍTICA | Alta |
| **Fase 6** | Compliance Admin Panel | 🟡 ALTA | Alta |
| **Fase 7** | Notificaciones + Observabilidad | 🟡 ALTA | Media |
| **Fase 8** | Testing + Seguridad + Deploy | 🟡 ALTA | Alta |

---

## 📂 ARCHIVOS DE ESTE PLAN

```
plan_implementacion/
├── 00_OVERVIEW_Y_ESTADO_ACTUAL.md      ← Este archivo
├── 01_FASE_0_Base_DB_Triggers.md       ← Triggers PostgreSQL, Seed, RLS
├── 02_FASE_1_Auth_e_Identidad.md       ← Auth endpoints, profiles
├── 03_FASE_2_Onboarding_KYC_KYB.md     ← Flujo de verificación completo
├── 04_FASE_3_Core_Financiero.md         ← Wallets, Ledger, Balances
├── 05_FASE_4_Bridge_Integracion.md     ← Bridge API completa
├── 06_FASE_5_Webhooks_Worker.md        ← Webhook Sink + CRON refactor
├── 07_FASE_6_Compliance_Admin.md       ← Panel de revisión para Staff
├── 08_FASE_7_Notificaciones_Obs.md     ← Notifications, Audit, Support
└── 09_FASE_8_Testing_Security.md       ← Tests, seguridad, deployment
```

---

## ⚙️ STACK TÉCNICO

- **Runtime:** Node.js 20 LTS
- **Framework:** NestJS 10 + TypeScript strict
- **Database:** PostgreSQL 17 via Supabase (`@supabase/supabase-js`)
- **Auth:** Supabase Auth (JWT) + Custom Guards en NestJS
- **Pagos:** Bridge API v0 (`api.bridge.xyz`)
- **Storage:** Supabase Storage (documentos KYC/KYB)
- **Jobs:** `@nestjs/schedule` (CronExpression)
- **Validación:** `class-validator` + `class-transformer`
- **Env:** `.env.local` → `ConfigModule`
