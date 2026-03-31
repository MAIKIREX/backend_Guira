# 05 — Caso C: Depósito vía Liquidation Address (Crypto → Fiat)

> **Escenario:** El usuario envía USDC desde una wallet externa a una dirección de liquidación de Bridge. Bridge convierte el crypto a USD y lo deposita en la cuenta bancaria del usuario. Una `payment_order` se genera implícitamente como parte del flujo.

---

## 🧠 ¿Qué es una Liquidation Address?

Una **Liquidation Address** es una dirección blockchain (ej. Ethereum) emitida por Bridge que funciona como "rampa de salida": el usuario envía USDC a esa dirección, Bridge lo convierte automáticamente a USD y lo envía al banco del usuario.

```
[Wallet del usuario] --USDC--> [Liquidation Address (Bridge)] --USD--> [Banco del usuario]
```

---

## 🎯 Precondiciones

1. ✅ El usuario tiene una `bridge_liquidation_address` registrada
2. ✅ La dirección está asociada a una `bridge_external_account` (su cuenta bancaria)
3. ✅ Existe una `wallet` activa del usuario en Guira

---

## 👣 Flujo Paso a Paso

### Paso 1: Usuario Envía USDC

```
[Usuario: Wallet MetaMask]
    │
    └── Envía 500 USDC a dirección 0xBridgeLiqAddress...
```

### Paso 2: Bridge Detecta y Envía Webhook

```json
{
    "type": "liquidation_address.payment_completed",
    "id": "evt_liq_001",
    "data": {
        "liquidation_address_id": "liq_addr_xxx",
        "amount": "500.00",
        "currency": "usd"
    }
}
```

### Paso 3: Webhook Sink + CRON (igual que siempre)

```
POST /webhooks/bridge → INSERT webhook_events → 200 OK
CRON cada 30s → procesa → handleLiquidationPayment()
```

### Paso 4: Handler `handleLiquidationPayment`

```typescript
// 1. Buscar la liquidation address
const { data: addr } = await supabase
    .from('bridge_liquidation_addresses')
    .select('id, user_id, destination_currency')
    .eq('bridge_liquidation_address_id', 'liq_addr_xxx')
    .single();

// 2. Obtener wallet del usuario
const { data: wallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', addr.user_id)
    .eq('is_active', true)
    .single();

// 3. INSERT ledger_entry (credit, settled)
await supabase.from('ledger_entries').insert({
    wallet_id: wallet.id,
    type: 'credit',
    amount: 500.00,
    currency: addr.destination_currency ?? 'usd',
    description: 'Liquidación crypto recibida — $500.00',
    reference_type: 'liquidation_address',
    reference_id: addr.id,
    status: 'settled',
});

// 4. Notificación
await supabase.from('notifications').insert({
    user_id: addr.user_id,
    type: 'financial',
    title: 'Liquidación Recibida',
    message: 'Recibiste $500.00 de liquidación crypto',
});
```

---

## 🔍 ¿Se Crea `payment_order` en este caso?

### Estado Actual de la Implementación: ❌ NO

En la implementación actual del `handleLiquidationPayment()`, **no se crea una `payment_order`**. El handler va directamente de la liquidation address al `ledger_entry`.

### ¿Debería crearse? ✅ SÍ (Recomendación)

Para mantener consistencia y trazabilidad completa, se recomienda que el flujo de liquidación **también genere una `payment_order`** antes de crear el `ledger_entry`. Esto permitiría:

1. **Trazabilidad uniforme:** Todos los depósitos (Wire, ACH, Crypto) tienen un registro en `payment_orders`
2. **Reportes consistentes:** Dashboard de Admin muestra todos los ingresos en una sola tabla
3. **Soporte al cliente:** Los tickets de soporte pueden referenciar una `payment_order` sin importar la vía de entrada

### Flujo Propuesto (Futuro)

```sql
-- Agregar antes del ledger_entry:
INSERT INTO payment_orders (
    user_id,
    wallet_id,
    source_type,              -- 'liquidation_address'
    source_reference_id,      -- liq_addr_xxx
    amount,                   -- 500.00
    fee_amount,               -- calculado
    net_amount,               -- 500.00 - fee
    currency,                 -- 'usd'
    bridge_event_id,          -- evt_liq_001
    status                    -- 'completed'
) VALUES (...);
```

---

## 📊 Cadena de Datos

```
bridge_liquidation_addresses
    ↓ webhook
bridge_virtual_account_events (❌ no se usa en liquidación)
    ↓
payment_orders (❌ actualmente no se crea — recomendado agregar)
    ↓
ledger_entries (✅ credit settled)
    ↓ trigger
balances (✅ amount incrementado)
    ↓
notifications (✅ alerta al usuario)
```

---

## 📁 Archivo Fuente

**Implementación:** [`webhooks.service.ts`](../../src/application/webhooks/webhooks.service.ts) — método `handleLiquidationPayment()` (líneas 672-718)
