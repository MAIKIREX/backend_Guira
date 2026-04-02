# Fase 4 — Integración con WebhooksService

> **Dependencia:** Requiere que las Fases 1-3 estén completadas  
> **Archivo a modificar:** `src/application/webhooks/webhooks.service.ts`

---

## 4.1 Contexto Actual

El `WebhooksService` actual maneja estos eventos:

| Evento | Handler | Estado |
|--------|---------|--------|
| `virtual_account.funds_received` | `handleFundsReceived` | ✅ Funcional |
| `transfer.payment_processed` | `handleTransferPaymentProcessed` | ✅ Funcional |
| `transfer.complete` | `handleTransferComplete` | ✅ Funcional |
| `transfer.failed` | `handleTransferFailed` | ✅ Funcional |
| `kyc_link.approved` | `handleKycApproved` | ✅ Funcional |
| `liquidation_address.payment_completed` | `handleLiquidationPayment` | ✅ Funcional |

### Problema

Los handlers actuales actualizan `bridge_transfers` y `payout_requests`, pero **NO actualizan `payment_orders`**. Con los nuevos flujos, necesitamos que los webhooks de Bridge también actualicen el estado de las `payment_orders` cuando estas estén vinculadas a un `bridge_transfer_id`.

---

## 4.2 Cambios Necesarios

### 4.2.1 `handleTransferPaymentProcessed` (Líneas 411-423)

**Agregar:** Después de actualizar `bridge_transfers`, buscar y actualizar `payment_orders` vinculadas.

```typescript
// ── EXISTENTE (no cambiar) ──
await this.supabase
  .from('bridge_transfers')
  .update({
    bridge_state: 'payment_processed',
    updated_at: new Date().toISOString(),
  })
  .eq('bridge_transfer_id', transferId);

// ── NUEVO: Actualizar payment_order vinculada ──
await this.supabase
  .from('payment_orders')
  .update({
    status: 'processing',
    updated_at: new Date().toISOString(),
  })
  .eq('bridge_transfer_id', transferId)
  .in('status', ['created', 'waiting_deposit']);
```

### 4.2.2 `handleTransferComplete` (Líneas 430-508)

**Agregar:** Después del bloque existente (tras certificados, notificaciones, etc.), buscar y completar `payment_orders`.

```typescript
// ── EXISTENTE (líneas 437-507) — NO cambiar ──
// [todo el bloque actual permanece igual]

// ── NUEVO: Actualizar payment_order vinculada ──
const { data: linkedOrder } = await this.supabase
  .from('payment_orders')
  .update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    tx_hash: (data?.destination_tx_hash as string) ?? null,
  })
  .eq('bridge_transfer_id', bridgeTransferId)
  .in('status', ['processing', 'waiting_deposit', 'created'])
  .select('id, user_id, flow_type, requires_psav')
  .maybeSingle();

if (linkedOrder) {
  this.logger.log(
    `✅ Payment order ${linkedOrder.id} completada por webhook (flow: ${linkedOrder.flow_type})`,
  );

  // Notificación específica para payment_order (distinta de la de payout)
  await this.supabase.from('notifications').insert({
    user_id: linkedOrder.user_id,
    type: 'financial',
    title: 'Orden de Pago Completada',
    message: `Tu orden de pago ha sido completada exitosamente`,
    reference_type: 'payment_order',
    reference_id: linkedOrder.id,
  });

  // Activity log
  await this.supabase.from('activity_logs').insert({
    user_id: linkedOrder.user_id,
    action: 'PAYMENT_ORDER_COMPLETED',
    description: `Orden ${linkedOrder.id} (${linkedOrder.flow_type}) completada vía webhook`,
  });
}
```

### 4.2.3 `handleTransferFailed` (Líneas 515-586)

**Agregar:** Después del bloque existente, buscar y fallar `payment_orders`.

```typescript
// ── EXISTENTE (líneas 520-585) — NO cambiar ──
// [todo el bloque actual permanece igual]

// ── NUEVO: Actualizar payment_order vinculada ──
const { data: linkedOrder } = await this.supabase
  .from('payment_orders')
  .update({
    status: 'failed',
    failure_reason: 'Bridge transfer failed',
    updated_at: new Date().toISOString(),
  })
  .eq('bridge_transfer_id', bridgeTransferId)
  .in('status', ['processing', 'waiting_deposit', 'created'])
  .select('id, user_id, flow_type, wallet_id, amount, fee_amount, currency')
  .maybeSingle();

if (linkedOrder) {
  // Si era un flujo de salida de wallet Bridge, liberar saldo reservado
  const outboundFlows = [
    'bridge_wallet_to_crypto',
    'bridge_wallet_to_fiat_us',
    'bridge_wallet_to_fiat_bo',
  ];

  if (outboundFlows.includes(linkedOrder.flow_type ?? '')) {
    const totalReserved =
      parseFloat(linkedOrder.amount ?? '0') +
      parseFloat(linkedOrder.fee_amount ?? '0');

    await this.supabase.rpc('release_reserved_balance', {
      p_user_id: linkedOrder.user_id,
      p_currency: (linkedOrder.currency ?? 'USDC').toUpperCase(),
      p_amount: totalReserved,
    });
  }

  // Notificación
  await this.supabase.from('notifications').insert({
    user_id: linkedOrder.user_id,
    type: 'alert',
    title: 'Orden de Pago Fallida',
    message: `Tu orden de pago falló. Contacta soporte si el problema persiste.`,
    reference_type: 'payment_order',
    reference_id: linkedOrder.id,
  });

  // Activity log
  await this.supabase.from('activity_logs').insert({
    user_id: linkedOrder.user_id,
    action: 'PAYMENT_ORDER_FAILED',
    description: `Orden ${linkedOrder.id} (${linkedOrder.flow_type}) falló — saldo liberado`,
  });

  this.logger.warn(
    `❌ Payment order ${linkedOrder.id} fallida por webhook`,
  );
}
```

### 4.2.4 `handleFundsReceived` — Vincular con payment_orders existentes

**Agregar:** Antes de crear un nuevo `payment_order` automáticamente, verificar si ya existe una orden que esté esperando este depósito.

```typescript
// ── NUEVO: Verificar si existe payment_order en waiting_deposit ──
// Esto se activa cuando el usuario depositó vía Virtual Account
// y ya había creado una payment_order (flujos: fiat_us_to_bridge_wallet, world_to_wallet)
const { data: pendingOrder } = await this.supabase
  .from('payment_orders')
  .select('id, user_id, flow_type, wallet_id, amount')
  .eq('user_id', va.user_id)
  .eq('status', 'waiting_deposit')
  .in('flow_type', ['fiat_us_to_bridge_wallet', 'world_to_wallet'])
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (pendingOrder) {
  // Actualizar orden existente en vez de crear una nueva
  await this.supabase
    .from('payment_orders')
    .update({
      status: 'completed',
      bridge_event_id: (payload.id as string) ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', pendingOrder.id);

  // Continuar con el flujo existente (ledger, notifications, etc.)
  // usando pendingOrder.id como reference_id
  // ... [el resto del flujo handleInternalDeposit/handleExternalSweep sigue igual]
  return;
}

// Si no hay orden pendiente, el flujo existente se ejecuta normalmente
// (crea un payment_order nuevo con status 'completed')
```

> **Nota:** Este cambio es ADITIVO. No modifica la lógica existente del `handleFundsReceived`, solo agrega un check previo para vincular fondos recibidos con órdenes existentes.

---

## 4.3 Diagrama de Flujo Post-Webhook

```
┌──────────────────────────────────┐
│         Bridge Webhook           │
│    (transfer.complete, etc.)     │
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│      WebhooksService             │
│   (dispatchEvent → handler)      │
└───────────────┬──────────────────┘
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
┌───────────┐ ┌────────┐ ┌───────────────┐
│  bridge   │ │ payout │ │  payment      │ ← NUEVO
│ _transfers│ │_request│ │  _orders      │
│  UPDATE   │ │ UPDATE │ │  UPDATE       │
└───────────┘ └────────┘ └───────────────┘
                │                 │
                ▼                 ▼
        ┌───────────────┐ ┌──────────────┐
        │ ledger_entries│ │ notifications│
        │    UPDATE     │ │   INSERT     │
        └───────────────┘ └──────────────┘
```

---

## 4.4 Consideraciones de Backward Compatibility

| Situación | Comportamiento |
|-----------|---------------|
| Transfer con `bridge_transfer_id` vinculado a `payment_orders` | ✅ Se actualiza payment_order |
| Transfer SIN vínculo con `payment_orders` (flujo legacy de payout) | ✅ La query `.eq('bridge_transfer_id', ...)` retorna null → no hace nada |
| Transfer vinculado a AMBOS `payout_requests` y `payment_orders` | ✅ Se actualizan ambos independientemente |

Los cambios son **puramente aditivos** — no se modifica ni se elimina ninguna línea existente del `WebhooksService`.
