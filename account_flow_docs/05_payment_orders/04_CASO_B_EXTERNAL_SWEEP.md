# 04 — Caso B: External Sweep (Fondos van a Wallet Externa)

> **Escenario:** Un tercero envía fondos a la cuenta virtual del usuario, pero la Virtual Account está configurada con `is_external_sweep = true`. Bridge reenvía automáticamente los fondos a una wallet **fuera de Guira** (Binance, MetaMask, etc.). El balance de Guira **NO cambia**.

---

## 🧠 ¿Por Qué Existe Este Caso?

Algunos usuarios quieren recibir depósitos bancarios (Wire/ACH) pero **no quieren que los fondos se queden en Guira**. Prefieren que los fondos vayan directamente a su Binance, MetaMask u otra wallet crypto.

**Sin el patrón de doble asiento**, el sistema habría creado un balance ficticio en Guira:
- ❌ $990 en Binance + $990 ficticio en Guira = **doble gasto**

**Con el patrón de doble asiento:**
- ✅ $990 en Binance + $0 en Guira = correcto

---

## 🎯 Precondiciones

1. ✅ El usuario tiene una `bridge_virtual_account` con:
   - `is_external_sweep = true`
   - `destination_address = '0x742d35Cc...'` (address externo)
   - `external_destination_label = 'Mi Binance USDC'`
2. ✅ Existe una `wallet` activa del usuario (usada como referencia contable)
3. ✅ El webhook `virtual_account.funds_received` se recibe correctamente

---

## 👣 Flujo Paso a Paso

### Pasos 1-4: Idénticos al Caso A

La recepción del webhook, almacenamiento en `webhook_events`, procesamiento CRON y verificación de firma son **exactamente iguales** al [Caso A](./03_CASO_A_DEPOSITO_INTERNO.md).

### Paso 5: Bifurcación en `handleFundsReceived`

```typescript
if (va.is_external_sweep) {
    // ── CASO B: External Sweep (ESTE DOCUMENTO) ──
    await this.handleExternalSweepDeposit(va, amount, feeAmount, netAmount, ...);
} else {
    // ── CASO A: Depósito Interno ──
    await this.handleInternalDeposit(va, amount, feeAmount, netAmount, ...);
}
```

---

### Paso 5.1 — 💰 CREATE Payment Order (`status = 'swept_external'`)

```sql
INSERT INTO payment_orders (
    user_id,
    wallet_id,                     -- wallet de REFERENCIA (no destino real)
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
    'user-uuid-123',
    'wallet-uuid-ref-456',         -- wallet interna de referencia
    'bridge_virtual_account',
    'va_abc123',
    1000.00,
    10.00,
    990.00,
    'usd',
    'Proveedor XYZ',
    'evt_bridge_sweep_001',
    'swept_external'               -- ← ESTADO ESPECIAL
)
RETURNING id;

-- → id: 'ord-uuid-sweep-001'
```

> **Nota:** El `wallet_id` aquí es la wallet **de referencia** para el asiento contable. Los fondos reales ya están en `0x742d35Cc...` (Binance).

---

### Paso 5.2 — 📒 DOBLE ASIENTO CONTABLE (Credit + Debit)

#### Asiento 1: CRÉDITO — "El dinero entró desde la cuenta virtual"

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
    'wallet-uuid-ref-456',
    'credit',                  -- Abono
    990.00,                    -- +$990
    'usd',
    'settled',
    'payment_order',
    'ord-uuid-sweep-001',
    'Depósito recibido — Proveedor XYZ ($1000.00) [External Sweep]'
);
-- → Trigger DB: balances.amount += 990.00 (temporalmente)
```

#### Asiento 2: DÉBITO — "El dinero salió automáticamente a wallet externa"

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
    'wallet-uuid-ref-456',
    'debit',                   -- Débito
    990.00,                    -- -$990
    'usd',
    'settled',
    'payment_order',
    'ord-uuid-sweep-001',
    'Auto-sweep a wallet externa: Mi Binance USDC (0x742d35Cc...)'
);
-- → Trigger DB: balances.amount -= 990.00 (se cancela con el credit)
```

#### Resultado Neto en Balances

```
  Credit:  +$990.00
+ Debit:   -$990.00
─────────────────────
  Neto:     $0.00     ← Balance de Guira sin cambios ✅
```

---

### Paso 5.3 — 🔔 Notificación al Usuario

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
    'Depósito Reenviado a Wallet Externa',
    '$990.00 de Proveedor XYZ fue reenviado automáticamente a Mi Binance USDC (fee: $10.00)',
    'payment_order',
    'ord-uuid-sweep-001'
);
```

### Paso 5.4 — 📝 Activity Log

```sql
INSERT INTO activity_logs (
    user_id,
    action,
    description
) VALUES (
    'user-uuid-123',
    'DEPOSIT_EXTERNAL_SWEEP',
    'Depósito de $1000 de Proveedor XYZ → auto-sweep a Mi Binance USDC (0x742d35Cc...). Neto: $990 (fee: $10)'
);
```

---

## 📊 Comparativa: Caso A vs Caso B

```
┌────────────────────────────────────┬────────────────────────────────────┐
│    CASO A: Depósito Interno        │    CASO B: External Sweep          │
├────────────────────────────────────┼────────────────────────────────────┤
│ payment_order.status = 'completed' │ payment_order.status = 'swept_ext'│
│ ledger_entries: 1 (credit)         │ ledger_entries: 2 (credit + debit)│
│ balance: +$990.00                  │ balance: $0.00 (sin cambio)       │
│ fondos: en wallet Guira            │ fondos: en wallet externa         │
│ activity: DEPOSIT_RECEIVED         │ activity: DEPOSIT_EXTERNAL_SWEEP  │
│ notif: "Recibiste $990"            │ notif: "Reenviado a Binance"      │
└────────────────────────────────────┴────────────────────────────────────┘
```

---

## 📊 Estado Final de la Base de Datos

Suponiendo que el usuario tenía **$5,000.00** antes del depósito:

| Tabla | Campo | Antes | Después |
|:---|:---|:---:|:---:|
| `balances` | `amount` | $5,000.00 | **$5,000.00** (sin cambio) |
| `balances` | `available_amount` | $5,000.00 | **$5,000.00** (sin cambio) |
| `payment_orders` | — | — | 1 nuevo registro (`swept_external`) |
| `ledger_entries` | — | — | **2 nuevos registros** (credit + debit) |
| `bridge_virtual_account_events` | — | — | 1 nuevo registro |
| `webhook_events` | `status` | `pending` | `processed` |
| `notifications` | — | — | 1 nueva notificación |
| `activity_logs` | — | — | 1 nuevo log |

---

## 👀 Vista del Usuario en el Frontend

El historial de transacciones mostraría:

| Fecha | Descripción | Monto | Tipo |
|:---|:---|:---|:---|
| 2026-03-26 15:30 | Depósito recibido — Proveedor XYZ [External Sweep] | +$990.00 | Credit |
| 2026-03-26 15:30 | Auto-sweep a Mi Binance USDC | -$990.00 | Debit |

> El usuario tiene **total transparencia** de que el dinero entró y salió inmediatamente hacia su wallet externa.

---

## 🔐 Consideraciones de Seguridad

1. **Sin doble gasto:** Los dos asientos contables se cancelan mutuamente. No hay riesgo de que el usuario tenga dinero disponible que no existe.
2. **Auditoría completa:** Ambos ledger_entries están ligados a la misma `payment_order`, facilitando la trazabilidad.
3. **Fee aplica igual:** Bridge cobra el `developer_fee_percent` independientemente del destino.
4. **Idempotencia:** `bridge_event_id` UNIQUE previene doble procesamiento.

---

## 📁 Archivo Fuente

**Implementación:** [`webhooks.service.ts`](../../src/application/webhooks/webhooks.service.ts) — método `handleExternalSweepDeposit()` (líneas 312-405)
