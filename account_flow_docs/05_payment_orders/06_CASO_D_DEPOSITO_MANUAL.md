# 06 — Caso D: Depósito Manual / Ajuste por Staff o Admin

> **Escenario:** Un Admin necesita crear manualmente una `payment_order` para situaciones especiales: depósitos que llegaron fuera de Bridge, correcciones, fondeo inicial de prueba, o ajustes de reconciliación.

---

## 🧠 ¿Cuándo se usa?

| Situación | Ejemplo |
|:---|:---|
| **Depósito directo** | Cliente hizo un Wire directo al banco de Guira, sin pasar por Bridge |
| **Reconciliación** | Pull Job detectó un gap: Bridge recibió fondos pero no se procesó el webhook |
| **Ajuste de error** | Se cobró fee doble y necesita compensarse |
| **Fondeo de prueba** | QA necesita acreditar fondos en sandbox |
| **Migración** | Saldos previos de otra plataforma que se importan |

---

## 🎯 Precondiciones

1. ✅ El usuario tiene rol `admin` o `staff` con permisos de operaciones financieras
2. ✅ La justificación debe documentarse en el campo `notes`
3. ✅ Se genera un `audit_log` automáticamente

---

## 👣 Flujo Paso a Paso

### Paso 1: Admin Crea la Payment Order (status = 'pending')

```sql
INSERT INTO payment_orders (
    user_id,
    wallet_id,
    source_type,
    source_reference_id,
    amount,
    fee_amount,
    net_amount,
    currency,
    status,
    notes
) VALUES (
    'user-uuid-cliente',
    'wallet-uuid-cliente',
    'manual',                     -- ← source_type manual
    NULL,                         -- no hay referencia externa
    1500.00,
    0.00,                         -- sin fee en ajustes manuales
    1500.00,
    'USD',
    'pending',                    -- ← empieza en pending, requiere aprobación
    'Reconciliación: Wire de $1,500 recibido el 2026-03-25 fuera de Bridge. Ref bancaria: TRF-20260325-789. Autorizado por admin@guira.com'
);
```

### Paso 2: Segundo Admin Aprueba (doble control)

```sql
-- Para montos > PAYOUT_REVIEW_THRESHOLD, se requiere doble aprobación:
UPDATE payment_orders SET
    status = 'completed',
    completed_at = NOW()
WHERE id = 'ord-manual-uuid';
```

### Paso 3: Sistema Crea Ledger Entry

```sql
INSERT INTO ledger_entries (
    wallet_id,
    type,
    amount,
    currency,
    status,
    reference_type,
    reference_id,
    description
) VALUES (
    'wallet-uuid-cliente',
    'credit',
    1500.00,
    'USD',
    'settled',
    'payment_order',
    'ord-manual-uuid',
    'Ajuste manual: Wire externo reconciliado — TRF-20260325-789'
);
```

### Paso 4: Audit Log Automático

```sql
INSERT INTO audit_logs (
    performed_by,           -- ID del Admin que aprobó
    role,                   -- 'admin'
    action,                 -- 'MANUAL_PAYMENT_ORDER'
    table_name,             -- 'payment_orders'
    record_id,              -- ord-manual-uuid
    affected_fields,        -- ['status']
    previous_values,        -- { "status": "pending" }
    new_values,             -- { "status": "completed" }
    reason,                 -- 'Reconciliación de Wire externo...'
    source                  -- 'admin_panel'
);
```

---

## 🔐 Controles de Seguridad

| Control | Detalle |
|:---|:---|
| **RLS** | Solo `admin` y `service_role` pueden INSERT en `payment_orders` con `source_type = 'manual'` |
| **Audit inmutable** | El `audit_log` no puede editarse ni eliminarse |
| **Campo `notes` obligatorio** | Para `source_type = 'manual'`, el campo `notes` no debe ser NULL |
| **Doble aprobación** | Para montos > umbral, otro Admin debe cambiar `pending → completed` |
| **Sin `bridge_event_id`** | Los depósitos manuales NO tienen `bridge_event_id` (es NULL) |

---

## 📊 Diferencias vs. Depósito Automático

| Aspecto | Automático (Bridge) | Manual (Admin) |
|:---|:---|:---|
| `source_type` | `bridge_virtual_account` | `manual` |
| `bridge_event_id` | `evt_xxx` (UNIQUE) | `NULL` |
| `status` inicial | `completed` (directo) | `pending` (requiere aprobación) |
| `fee_amount` | Calculado por Bridge | Generalmente $0 |
| `notes` | NULL | Obligatorio (justificación) |
| Quién lo crea | `WebhooksService` (CRON) | Admin via panel |
| Audit log | No (registro de webhook es suficiente) | Sí (obligatorio) |

---

## 📁 Archivo Fuente

**Implementación actual:** No existe un endpoint dedicado para esto. Se haría via Supabase Dashboard o un futuro `AdminController.createManualPaymentOrder()`.
