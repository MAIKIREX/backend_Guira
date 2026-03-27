# Arquitectura General — New DB (Guira Production)

> **Versión:** 2.0 Production-Ready  
> **Motor:** PostgreSQL vía Supabase  
> **Integración de Pago Principal:** Bridge API (`api.bridge.xyz/v0`)  
> **Filosofía:** Ledger Inmutable + Balances Consolidados + Compliance Estructurado + Fiabilidad Asíncrona

---

## 🏛️ Principios de Diseño

Esta base de datos fue diseñada con los siguientes principios de nivel empresarial (Enterprise-grade):

1. **Modelo Híbrido de Saldo:** El saldo financiero visible del cliente se almacena en `balances` (actualizado por triggers), lo que permite consultas instantáneas. `ledger_entries` guarda el historial completo e inmutable de cada movimiento para auditoría. Ambas siempre están sincronizadas.

2. **Wallets como Cuentas Blockchain Reales:** La tabla `wallets` representa direcciones blockchain custodias emitidas por Bridge o Fireblocks, no contenedores numéricos. Cada wallet tiene `address`, `network` y `provider_key`, siendo la fuente real de fondos en Bridge Transfers.

3. **Onboarding Estructurado Relacional:** El proceso KYC/KYB no usa JSON dinámico sino tablas relacionales bien definidas: `people` (datos biográficos), `businesses` (entidad corporativa con todos los campos AML), `business_directors`, `business_ubos`, `kyc_applications` y `kyb_applications`.

4. **Compliance con Trazabilidad Completa:** Toda aprobación o rechazo emitida por el Staff se persiste en filas inmutables (`compliance_review_events`). Un inspector externo podrá ver exactamente quién aprobó qué, cuándo y por qué.

5. **Fiabilidad Asíncrona (Webhook Sink):** Ningún webhook externo de Bridge se procesa directamente. El payload crudo se guarda en `webhook_events`. Un proceso asíncrono (CRON/Worker) lo consume, garantizando que ningún depósito se pierda aunque el servidor esté caído.

6. **Row Level Security (RLS) en Todas las Tablas:** Los clientes únicamente ven sus propios datos. El Staff ve los datos de todos pero solo puede modificar los que le competen. Los Admins tienen acceso total de lectura.

7. **Idempotencia con Bridge:** Toda solicitud a Bridge API lleva un `idempotency_key` único, cuyo resultado se guarda localmente. Esto previene doble cobro o doble acreditación en caso de reintentos de red.

---

## 🗂️ Dominios de la Base de Datos

```
new_db/
├── 1_Identidad_y_Autenticacion/     → Quién es el usuario
├── 2_Onboarding_y_Compliance/       → Validación legal previa a operar
├── 3_Core_Financiero/               → El motor contable y financiero
├── 4_Integracion_Bridge/            → Conexión con el mundo bancario real
└── 5_Sistema_y_Observabilidad/      → Trazabilidad, alertas e infraestructura
```

---

## 🗺️ Mapa de Tablas

### 1. Identidad y Autenticación
| Tabla | Descripción |
|---|---|
| `profiles` | Perfil de negocio de cada usuario: roles, estado, bridge_customer_id |
| `auth_rate_limits` | Protección anti fuerza bruta por IP/email para OTP y login |

### 2. Onboarding y Compliance
| Tabla | Descripción |
|---|---|
| `people` | Datos biográficos completos del individuo (para KYC): nombre, DOB, ID, domicilio |
| `businesses` | Entidad corporativa con todos los campos AML/KYB: razón social, tax_id, directores, UBOs |
| `business_directors` | Directores y representantes legales de cada empresa (escrutinio OFAC individual) |
| `business_ubos` | Beneficiarios Finales (≥25% de propiedad) sometidos a screening AML |
| `kyc_applications` | Expediente formal de verificación KYC para personas naturales |
| `kyb_applications` | Expediente formal de verificación KYB para empresas |
| `documents` | Archivos legales adjuntos: IDs, escrituras, facturas, comprobantes de domicilio |
| `suppliers` | Proveedores recurrentes pre-verificados (para pagos B2B frecuentes) |
| **`transaction_limits`** | Límites AML por usuario (diario/semanal/mensual) con tiers standard/enhanced/vip |
| `compliance_reviews` | Caso de revisión abierto por Compliance/Staff sobre un KYC/KYB o pago |
| `compliance_review_comments` | Notas y observaciones del analista durante la revisión |
| `compliance_review_events` | Decisiones inmutables: APPROVED / REJECTED / NEEDS_CHANGES |

### 3. Core Financiero
| Tabla | Descripción |
|---|---|
| `wallets` | Wallets blockchain custodias (Bridge/Fireblocks): address, network, provider_wallet_id |
| `balances` | Saldo consolidado mutable por divisa (USD, USDC, EUR). Actualizado via trigger |
| `ledger_entries` | Historial completo e inmutable de cada movimiento financiero (crédito/débito) |
| `payin_routes` | Configuración de vías de entrada de dinero habilitadas |
| `payment_orders` | Órdenes de pago entrantes: incluye sender_name, exchange_rate, deposit_message |
| `payout_requests` | Solicitudes de retiro a cuentas externas con lógica de reserva de saldo |
| `fees_config` | Tarifas globales por tipo de transacción y vía de pago |
| `customer_fee_overrides` | Tarifas personalizadas negociadas por cliente VIP |
| `certificates` | Comprobantes PDF inmutables generados tras transacciones completadas |
| **`reconciliation_runs`** | Registro de conciliaciones `balances = SUM(ledger_entries)` para integridad financiera |

### 4. Integración Bridge
| Tabla | Descripción |
|---|---|
| `bridge_virtual_accounts` | Cuentas virtuales USD/EUR/MXN/BRL/GBP con rails ACH/Wire/SEPA/SPEI/PIX. Incluye IBAN, CLABE, BR_CODE |
| `bridge_virtual_account_events` | Log de cada evento crediticio o de estado sobre cuentas virtuales |
| `bridge_external_accounts` | Cuentas bancarias externas del cliente (destino de retiros) con IBAN/SWIFT para Europa |
| `bridge_transfers` | Registro de cada transfer: incluye receipt completo, bridge_state y destination_tx_hash |
| `bridge_liquidation_addresses` | Direcciones crypto de liquidación automática (Crypto→Fiat) |
| **`bridge_kyc_links`** | Links de verificación KYC interactiva generados por Bridge para los clientes |
| `bridge_pull_jobs` | Jobs de sincronización forzada con Bridge para detectar huecos transaccionales |
| `webhook_events` | Webhook Sink con verificación de firma HMAC y soporte para todos los event_types de Bridge |

### 5. Sistema y Observabilidad
| Tabla | Descripción |
|---|---|
| `audit_logs` | Trazabilidad inmutable de cada acción hecha por Staff/Admin |
| `activity_logs` | Feed de actividad visible para el cliente en la UI |
| `notifications` | Notificaciones Push/In-App para el usuario final |
| `support_tickets` | Tickets de soporte del help desk integrado |
| `app_settings` | Configuración global Key-Value de la plataforma (feature flags, límites) |

---

## 🔗 Diagrama de Relaciones Clave

```
auth.users (Supabase)
    └── profiles
            ├── people ──────────────────────────── kyc_applications
            │                                            └── compliance_reviews → compliance_review_events
            │                                                                   └── compliance_review_comments
            ├── businesses ──── business_directors
            │           └────── business_ubos
            │           └────── kyb_applications → compliance_reviews
            │
            ├── wallets (Bridge wallet: address + network)
            │      └── (referenciada como source en bridge_transfers)
            │
            ├── balances (saldo mutable USD/USDC/EUR — actualizado por trigger)
            │      └── sincronizado con ledger_entries
            │
            ├── ledger_entries (historial inmutable de movimientos)
            │       └── (originada por payment_orders, payout_requests, bridge_transfers)
            │
            ├── bridge_virtual_accounts → bridge_virtual_account_events → payment_orders → ledger_entries
            ├── bridge_external_accounts
            ├── bridge_transfers → ledger_entries → balances (trigger)
            ├── payout_requests → bridge_transfers
            ├── activity_logs
            └── notifications

webhook_events ──(CRON worker)──► ledger_entries / balances / payout_requests / notifications
audit_logs ◄── (trigger) ── toda mutación por staff/admin
```

---

## 📊 Flujo de Saldo: Modelo Híbrido

```
Depósito llega via Bridge Webhook
    → webhook_events (pending)
    → CRON worker procesa
    → INSERT ledger_entries (amount = +5000, type = 'deposit', status = 'settled')
    → Trigger PostgreSQL:
        UPDATE balances SET
            amount = amount + 5000,
            available_amount = amount + 5000 - reserved_amount
        WHERE user_id = X AND currency = 'USD'

Cliente consulta saldo:
    SELECT available_amount FROM balances WHERE user_id = X AND currency = 'USD'
    → ✅ Respuesta instantánea sin agregar millones de filas
```

---

## 📜 Documentos de Flujo Funcional
- `01_Flujo_Registro_y_Autenticacion.md` — Registro, KYC/KYB estructurado, aprobación Bridge.
- `02_Flujo_Transferencias_y_Bridge.md` — Depósitos (Virtual Accounts), pagos y retiros con Bridge.
- `03_Flujo_Compliance_y_Revisiones.md` — Revisión legal por el Staff con trazabilidad inmutable.
- `04_Flujo_Observabilidad_y_Sistema.md` — Webhooks, Audit Trail, Pull Jobs, Notificaciones.
