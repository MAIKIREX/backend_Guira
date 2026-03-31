# 03 — Caso A: Depósito Interno (Fondos se quedan en Guira)

> **Escenario:** Un tercero envía un Wire/ACH a la cuenta virtual del usuario. Los fondos llegan a Bridge, se convierten a USDC, y se acreditan a la wallet **interna** de Guira. El balance del usuario **sube**.

---

## 🎯 Precondiciones

1. ✅ El usuario tiene `onboarding_status = 'approved'` (KYC/KYB aprobado)
2. ✅ Existe una `wallet` activa asociada al usuario
3. ✅ Existe un `bridge_virtual_account` con `is_external_sweep = false` (o sin el flag)
4. ✅ El webhook endpoint `/webhooks/bridge` está activo y accesible

---

## 👣 Flujo Paso a Paso

### Paso 1: El Tercero Envía el Wire/ACH

```
[Tercero: "Acme Corp"]
    │
    └── Envía Wire de $1,000.00 USD
        al routing: 101019644
        al account: 215268120000
        referencia: "INV-2026-041"
```

### Paso 2: Bridge Recibe y Notifica

```
[Bridge detecta el depósito]
    │
    └── POST https://app.guira.com/webhooks/bridge
        Body: {
            "type": "virtual_account.funds_received",
            "id": "evt_bridge_789",
            "data": {
                "virtual_account_id": "va_abc123",
                "amount": "1000.00",
                "currency": "usd",
                "sender_name": "Acme Corp"
            }
        }
```

### Paso 3: Webhook Sink (Almacenamiento Inmediato)

```typescript
// webhooks.controller.ts — Responde < 100ms
await webhooksService.sinkEvent({
    provider: 'bridge',
    event_type: 'virtual_account.funds_received',
    provider_event_id: 'evt_bridge_789',
    raw_payload: payload,
    headers: { 'x-bridge-signature': '...' },
});
// → INSERT INTO webhook_events (status = 'pending')
// → return { received: true }  ← HTTP 200 inmediato
```

### Paso 4: CRON Worker Procesa (cada 30s)

```
@Cron('*/30 * * * * *')
    │
    └── SELECT * FROM webhook_events WHERE status = 'pending' LIMIT 50
        │
        ├── Verifica firma HMAC-SHA256
        ├── UPDATE webhook_events SET status = 'processing'
        └── Despacha a handleFundsReceived()
```

### Paso 5: Handler — `handleFundsReceived` → `handleInternalDeposit`

El handler ejecuta las siguientes operaciones **en secuencia**:

---

#### 5.1 — Buscar Virtual Account

```typescript
const { data: va } = await supabase
    .from('bridge_virtual_accounts')
    .select('id, user_id, destination_wallet_id, source_currency, developer_fee_percent, is_external_sweep')
    .eq('bridge_virtual_account_id', 'va_abc123')
    .single();

// Resultado:
// va.is_external_sweep = false → CASO A (Interno)
```

#### 5.2 — Registrar Evento VA (Auditoría)

```sql
INSERT INTO bridge_virtual_account_events (
    bridge_virtual_account_id,
    bridge_event_id,
    event_type,
    amount,
    currency,
    sender_name,
    raw_payload
) VALUES (
    'va_abc123',
    'evt_bridge_789',
    'virtual_account.funds_received',
    1000.00,
    'usd',
    'Acme Corp',
    '{ ... raw JSON ... }'
);
```

#### 5.3 — Calcular Fee

```
developer_fee_percent = 1.0%
fee_amount = 1000.00 × 1.0 / 100 = $10.00
net_amount = 1000.00 - 10.00 = $990.00
```

#### 5.4 — Obtener Wallet del Usuario

```typescript
// Si va.destination_wallet_id existe, usar ese
// Si no, buscar la wallet activa del usuario:
const { data: wallet } = await supabase
    .from('wallets')
    .select('id, currency')
    .eq('user_id', va.user_id)
    .eq('is_active', true)
    .limit(1)
    .single();
```

#### 5.5 — 💰 CREATE Payment Order (`status = 'completed'`)

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
    sender_name,
    bridge_event_id,
    status
) VALUES (
    'user-uuid-123',           -- usuario destinatario
    'wallet-uuid-456',         -- wallet interna
    'bridge_virtual_account',  -- origen del depósito
    'va_abc123',               -- referencia al VA de Bridge
    1000.00,                   -- bruto
    10.00,                     -- fee (1%)
    990.00,                    -- neto acreditado
    'usd',                     -- divisa
    'Acme Corp',               -- remitente
    'evt_bridge_789',          -- deduplicación
    'completed'                -- ← ESTADO FINAL DIRECTO
)
RETURNING id;

-- → id: 'ord-uuid-new-789'
```

#### 5.6 — 📒 CREATE Ledger Entry (Credit Settled)

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
    'wallet-uuid-456',
    'credit',              -- Abono
    990.00,                -- Monto neto
    'usd',
    'settled',             -- Liquidado inmediatamente
    'payment_order',       -- Polimorfismo
    'ord-uuid-new-789',    -- Referencia a la payment_order
    'Depósito recibido — Acme Corp ($1000.00)'
);
```

#### 5.7 — ⚡ Trigger PostgreSQL Actualiza Balances

```sql
-- El trigger se activa automáticamente al INSERT settled:
UPDATE balances SET
    amount = amount + 990.00,
    available_amount = (amount + 990.00) - reserved_amount,
    updated_at = NOW()
WHERE user_id = 'user-uuid-123'
  AND currency = 'USD';
```

#### 5.8 — 🔔 Notificación al Usuario

```sql
INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    reference_type,
    reference_id
) VALUES (
    'user-uuid-123',
    'financial',
    'Depósito Confirmado',
    'Recibiste $990.00 en tu wallet Guira (fee: $10.00)',
    'payment_order',
    'ord-uuid-new-789'
);
```

#### 5.9 — 📝 Activity Log

```sql
INSERT INTO activity_logs (
    user_id,
    action,
    description
) VALUES (
    'user-uuid-123',
    'DEPOSIT_RECEIVED',
    'Depósito de $1000 recibido de Acme Corp via VA → wallet interna'
);
```

#### 5.10 — ✅ Marcar Webhook como Procesado

```sql
UPDATE webhook_events SET
    status = 'processed',
    processed_at = NOW()
WHERE id = 'webhook-event-id';
```

---

## 📊 Estado Final de la Base de Datos

Suponiendo que el usuario tenía **$5,000.00** antes del depósito:

| Tabla | Campo | Antes | Después |
|:---|:---|:---:|:---:|
| `balances` | `amount` | $5,000.00 | **$5,990.00** |
| `balances` | `available_amount` | $5,000.00 | **$5,990.00** |
| `payment_orders` | — | — | 1 nuevo registro (`completed`) |
| `ledger_entries` | — | — | 1 nuevo registro (`credit settled $990`) |
| `bridge_virtual_account_events` | — | — | 1 nuevo registro |
| `webhook_events` | `status` | `pending` | `processed` |
| `notifications` | — | — | 1 nueva notificación |
| `activity_logs` | — | — | 1 nuevo log |

---

## ⏱️ Tiempos Estimados

| Etapa | Tiempo |
|:---|:---|
| Bridge envía webhook → Guira responde 200 | < 100ms |
| CRON worker lee el evento pendiente | ≤ 30 segundos |
| Handler procesa (5 INSERTs + 1 UPDATE) | < 500ms |
| **Total end-to-end** | **~30-31 segundos** |

---

## 🔴 Manejo de Errores

| Error | Comportamiento |
|:---|:---|
| VA no encontrada | `throw Error` → webhook queda en `pending`, retry_count++ |
| Wallet no encontrada | `throw Error` → webhook queda en `pending`, retry_count++ |
| Duplicate `bridge_event_id` | INSERT rechazado por UNIQUE → no hay doble acreditación |
| Error en INSERT ledger | `throw Error` → payment_order se crea PERO el ledger no; en retry se re-intenta todo |
| Retry count ≥ 5 | Webhook marcado como `failed` + notificación a Admin |

---

## 📁 Archivo Fuente

**Implementación:** [`webhooks.service.ts`](../../src/application/webhooks/webhooks.service.ts) — método `handleInternalDeposit()` (líneas 232-304)
