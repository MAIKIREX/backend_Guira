# 01 — Estructura y Schema de `payment_orders`

> **Tabla:** `public.payment_orders`  
> **Dominio:** Core Financiero  
> **Motor:** PostgreSQL vía Supabase

---

## 📋 Definición de Columnas

| # | Columna | Tipo PostgreSQL | Restricciones | Default | Descripción |
|:---:|:---|:---|:---|:---|:---|
| 1 | `id` | `uuid` | **PK**, NOT NULL | `uuid_generate_v4()` | Identificador único de la orden de pago |
| 2 | `user_id` | `uuid` | NOT NULL, **FK → `profiles.id`** | — | Usuario destinatario del depósito |
| 3 | `wallet_id` | `uuid` | NOT NULL, **FK → `wallets.id`** | — | Wallet que recibirá (o referenciará) los fondos |
| 4 | `payin_route_id` | `uuid` | nullable, **FK → `payin_routes.id`** | `NULL` | Vía de pago por la que ingresó el dinero (Wire, ACH, SEPA, etc.) |
| 5 | `source_type` | `text` | NOT NULL | — | Origen del depósito (ver tabla abajo) |
| 6 | `source_reference_id` | `text` | nullable | `NULL` | ID del objeto origen en Bridge (ej. `va_abc123`) |
| 7 | `amount` | `numeric(20,6)` | NOT NULL, CHECK > 0 | — | **Monto bruto** recibido en la divisa origen |
| 8 | `fee_amount` | `numeric(20,6)` | NOT NULL | `0` | Comisión deducida (developer fee de Bridge) |
| 9 | `net_amount` | `numeric(20,6)` | NOT NULL | — | **Monto neto** acreditado al cliente (`amount - fee_amount`) |
| 10 | `currency` | `text` | NOT NULL | — | Divisa del depósito acreditado (ej. `'USDC'`, `'USD'`) |
| 11 | `source_currency` | `text` | nullable | `NULL` | Divisa original del remitente. Puede diferir si hubo conversión |
| 12 | `sender_name` | `text` | nullable | `NULL` | Nombre del remitente (del webhook). **Fundamental para AML** |
| 13 | `sender_bank_name` | `text` | nullable | `NULL` | Banco del remitente (disponible en Wire/ACH) |
| 14 | `deposit_message` | `text` | nullable | `NULL` | Referencia del remitente (factura, contrato, etc.) |
| 15 | `exchange_rate` | `numeric(18,8)` | nullable | `NULL` | Tasa de cambio aplicada (ej. 1 USD = 1.0001 USDC) |
| 16 | `exchange_fee` | `numeric(20,6)` | nullable | `NULL` | Fee de conversión de divisa (del receipt de Bridge) |
| 17 | `status` | `text` | NOT NULL, CHECK | `'pending'` | Estado actual de la orden (ver doc 02) |
| 18 | `bridge_event_id` | `text` | **UNIQUE**, nullable | `NULL` | ID del evento de Bridge — **clave de deduplicación** |
| 19 | `notes` | `text` | nullable | `NULL` | Notas internas del Staff para depósitos manuales |
| 20 | `completed_at` | `timestamptz` | nullable | `NULL` | Fecha real de acreditación al ledger |
| 21 | `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación de la orden |

---

## 🔗 Foreign Keys (Relaciones)

```
payment_orders.user_id          → profiles.id           (N:1 — muchas órdenes por usuario)
payment_orders.wallet_id        → wallets.id            (N:1 — muchas órdenes por wallet)
payment_orders.payin_route_id   → payin_routes.id       (N:1 — muchas órdenes por ruta, nullable)
```

### Relaciones Inversas (Tablas que referencian a payment_orders)

```
ledger_entries.reference_id     → payment_orders.id     (via reference_type = 'payment_order')
notifications.reference_id      → payment_orders.id     (via reference_type = 'payment_order')
support_tickets.reference_id    → payment_orders.id     (via reference_type = 'payment_order')
certificates.subject_id         → payment_orders.id     (via subject_type = 'payment_order')
```

> **Nota:** Estas relaciones inversas son **polimórficas** — no usan FK directa, sino el patrón `reference_type + reference_id`.

---

## 🏷️ Valores Permitidos para `source_type`

| Valor | Significado | Cuándo se usa |
|:---|:---|:---|
| `'bridge_virtual_account'` | Depósito fiat recibido vía cuenta virtual de Bridge | Webhook `virtual_account.funds_received` |
| `'crypto_wallet'` | Depósito crypto directo | Transferencia directa a wallet address |
| `'liquidation_address'` | Liquidación cripto→fiat vía Bridge | Webhook `liquidation_address.payment_completed` |
| `'manual'` | Ajuste manual creado por Staff/Admin | Panel de administración |

---

## 🔒 Row Level Security (RLS)

| Rol | SELECT | INSERT | UPDATE | DELETE |
|:---|:---:|:---:|:---:|:---:|
| **Cliente** (`authenticated`) | ✅ Solo sus órdenes (`user_id = auth.uid()`) | ❌ | ❌ | ❌ |
| **Staff** | ✅ Todas | ❌ | ❌ | ❌ |
| **Admin** | ✅ Todas | ✅ (para ajustes manuales) | ✅ (cambio de status) | ❌ |
| **service_role** (backend) | ✅ Todas | ✅ | ✅ | ❌ |

> **Regla crítica:** Ningún rol puede **DELETE** de `payment_orders`. Los registros son permanentes e inmutables para auditoría.

---

## 🧮 Fórmula de Montos

```
net_amount = amount - fee_amount
```

Donde:
- **`amount`** = Monto bruto que Bridge reporta como recibido
- **`fee_amount`** = `amount × developer_fee_percent / 100` (calculado en el backend)
- **`net_amount`** = Lo que realmente se acredita al cliente

### Ejemplo Numérico

```
Depósito bruto: $5,050.00 USD
Fee (1.0%):     $50.50
Neto:           $4,999.50

→ payment_orders.amount     = 5050.00
→ payment_orders.fee_amount = 50.50
→ payment_orders.net_amount = 4999.50
```

---

## 📄 Ejemplo JSON Completo

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

---

## 🗂️ Índices Recomendados

| Índice | Columnas | Propósito |
|:---|:---|:---|
| `pk_payment_orders` | `id` | Primary key |
| `idx_po_user_id` | `user_id` | Consultas de órdenes por usuario |
| `idx_po_wallet_id` | `wallet_id` | Join con wallet para reportes |
| `idx_po_bridge_event_id` | `bridge_event_id` (UNIQUE) | **Deduplicación** — prevenir doble acreditación |
| `idx_po_status` | `status` | Filtrar órdenes por estado (dashboard admin) |
| `idx_po_created_at` | `created_at` | Ordenamiento cronológico |
| `idx_po_source_type` | `source_type` | Filtrar por tipo de fuente |
