# Fase 5 — Endpoints Admin para Gestión PSAV

> **Dependencia:** Requiere que las Fases 1-4 estén completadas  
> **Tipo:** Endpoints para panel de administración

---

## 5.1 Contexto

Los flujos PSAV (`requires_psav = true`) necesitan intervención manual del equipo de Guira:

1. **Verificar** que el usuario depositó a la cuenta PSAV
2. **Aprobar** la orden y fijar tipo de cambio
3. **Marcar como enviada** cuando el PSAV transfiere los fondos al destino
4. **Completar** la orden con el comprobante final

Estos endpoints son usados por el **Admin Panel (frontend)** donde el staff ve las órdenes pendientes.

---

## 5.2 Máquina de Estados — Admin PSAV

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌────────────────┐    ┌───────────┐    ┌───────────┐
│   created    │───→│ waiting_deposit  │───→│ deposit_received│───→│  processing    │───→│   sent    │───→│ completed │
└──────────────┘    └──────────────────┘    └─────────────────┘    └────────────────┘    └───────────┘    └───────────┘
      │                    │                       │                      │                    │
      └────────────────────┴───────────────────────┴──────────────────────┴────────────────────┘
                                        ↓ (en cualquier punto)
                                  ┌───────────┐
                                  │  failed   │
                                  └───────────┘
```

### Transiciones y quién las ejecuta

| Transición | Actor | Endpoint |
|-----------|-------|----------|
| `created` → `waiting_deposit` | Sistema (automático al crear) | `POST /payment-orders/interbank` |
| `waiting_deposit` → `deposit_received` | Cliente (sube comprobante) | `POST /payment-orders/:id/confirm-deposit` |
| `deposit_received` → `processing` | Staff/Admin (aprueba) | `POST /admin/payment-orders/:id/approve` |
| `processing` → `sent` | Staff/Admin (marca enviado) | `POST /admin/payment-orders/:id/mark-sent` |
| `sent` → `completed` | Staff/Admin (marca completado) | `POST /admin/payment-orders/:id/complete` |
| `* → failed` | Staff/Admin (marca fallido) | `POST /admin/payment-orders/:id/fail` |

---

## 5.3 Implementación Detallada de Endpoints Admin

### `POST /admin/payment-orders/:id/approve`

```typescript
async approveOrder(orderId: string, actorId: string, dto: ApproveOrderDto) {
  // 1. Obtener orden
  const { data: order } = await this.supabase
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) throw new NotFoundException('Orden no encontrada');
  if (order.status !== 'deposit_received')
    throw new BadRequestException(
      `No se puede aprobar una orden en estado "${order.status}". Estado requerido: "deposit_received"`,
    );
  if (!order.requires_psav)
    throw new BadRequestException('Esta orden no requiere aprobación manual');

  // 2. Obtener tipo de cambio actual (si no se proporcionó uno manual)
  let exchangeRate = dto.exchange_rate_applied;
  if (!exchangeRate && order.flow_type) {
    // Determinar par de conversión según el flujo
    const pairMap: Record<string, string> = {
      bolivia_to_world: 'BOB_USD',
      world_to_bolivia: 'USD_BOB',
      bolivia_to_wallet: 'BOB_USD',
      fiat_bo_to_bridge_wallet: 'BOB_USD',
      bridge_wallet_to_fiat_bo: 'USDC_BOB',
    };
    const pair = pairMap[order.flow_type];
    if (pair) {
      const rateData = await this.exchangeRatesService.getRate(pair);
      exchangeRate = rateData.effective_rate;
    }
  }

  // 3. Calcular monto destino si hay tipo de cambio
  const amountDestination = exchangeRate
    ? parseFloat((parseFloat(order.amount) * exchangeRate).toFixed(2))
    : null;

  // 4. Actualizar orden
  const { data: updated, error } = await this.supabase
    .from('payment_orders')
    .update({
      status: 'processing',
      approved_by: actorId,
      approved_at: new Date().toISOString(),
      exchange_rate_applied: exchangeRate,
      amount_destination: amountDestination,
      fee_amount: dto.fee_final ?? order.fee_amount,
      notes: dto.notes
        ? `${order.notes ?? ''}\n[ADMIN] ${dto.notes}`.trim()
        : order.notes,
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new BadRequestException(error.message);

  // 5. Audit log
  await this.supabase.from('audit_logs').insert({
    performed_by: actorId,
    action: 'APPROVE_PAYMENT_ORDER',
    table_name: 'payment_orders',
    record_id: orderId,
    previous_values: { status: 'deposit_received' },
    new_values: {
      status: 'processing',
      exchange_rate_applied: exchangeRate,
      amount_destination: amountDestination,
    },
    source: 'admin_panel',
  });

  // 6. Notificación al usuario
  await this.supabase.from('notifications').insert({
    user_id: order.user_id,
    type: 'financial',
    title: 'Orden Aprobada',
    message: `Tu orden de pago por $${order.amount} ha sido aprobada y está siendo procesada.`,
    reference_type: 'payment_order',
    reference_id: orderId,
  });

  return updated;
}
```

### `POST /admin/payment-orders/:id/mark-sent`

```typescript
async markSent(orderId: string, actorId: string, dto: MarkSentDto) {
  const { data: order } = await this.supabase
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) throw new NotFoundException('Orden no encontrada');
  if (order.status !== 'processing')
    throw new BadRequestException(
      `No se puede marcar como enviada una orden en estado "${order.status}"`,
    );

  const { data: updated, error } = await this.supabase
    .from('payment_orders')
    .update({
      status: 'sent',
      tx_hash: dto.tx_hash,
      provider_reference: dto.provider_reference,
      notes: dto.notes
        ? `${order.notes ?? ''}\n[ADMIN] ${dto.notes}`.trim()
        : order.notes,
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new BadRequestException(error.message);

  // Audit log
  await this.supabase.from('audit_logs').insert({
    performed_by: actorId,
    action: 'MARK_SENT_PAYMENT_ORDER',
    table_name: 'payment_orders',
    record_id: orderId,
    new_values: { status: 'sent', tx_hash: dto.tx_hash },
    source: 'admin_panel',
  });

  // Notificación al usuario
  await this.supabase.from('notifications').insert({
    user_id: order.user_id,
    type: 'financial',
    title: 'Fondos Enviados',
    message: `Los fondos de tu orden han sido enviados. Referencia: ${dto.tx_hash}`,
    reference_type: 'payment_order',
    reference_id: orderId,
  });

  return updated;
}
```

### `POST /admin/payment-orders/:id/complete`

```typescript
async completeOrder(orderId: string, actorId: string, dto: CompleteOrderDto) {
  const { data: order } = await this.supabase
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) throw new NotFoundException('Orden no encontrada');
  if (order.status !== 'sent')
    throw new BadRequestException(
      `No se puede completar una orden en estado "${order.status}"`,
    );

  const { data: updated, error } = await this.supabase
    .from('payment_orders')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      receipt_url: dto.receipt_url,
      notes: dto.notes
        ? `${order.notes ?? ''}\n[ADMIN] ${dto.notes}`.trim()
        : order.notes,
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new BadRequestException(error.message);

  // Si era un flujo ON-RAMP al wallet Bridge (fiat_bo_to_bridge_wallet),
  // acreditar el balance en la wallet del usuario
  const onRampFlows = ['fiat_bo_to_bridge_wallet'];
  if (onRampFlows.includes(order.flow_type ?? '')) {
    const netAmount = parseFloat(order.net_amount ?? order.amount);
    await this.supabase.from('ledger_entries').insert({
      wallet_id: order.wallet_id,
      type: 'credit',
      amount: netAmount,
      currency: order.currency,
      status: 'settled',
      reference_type: 'payment_order',
      reference_id: orderId,
      description: `Rampa on-ramp completada — $${netAmount} (PSAV)`,
    });
  }

  // Si era un flujo OFF-RAMP (bridge_wallet_to_fiat_bo),
  // liberar el saldo reservado y asentar el ledger
  const offRampFlows = ['bridge_wallet_to_fiat_bo'];
  if (offRampFlows.includes(order.flow_type ?? '')) {
    const totalReserved =
      parseFloat(order.amount ?? '0') + parseFloat(order.fee_amount ?? '0');

    // Crear ledger entry (debit, settled)
    await this.supabase.from('ledger_entries').insert({
      wallet_id: order.wallet_id,
      type: 'debit',
      amount: totalReserved,
      currency: order.currency,
      status: 'settled',
      reference_type: 'payment_order',
      reference_id: orderId,
      description: `Off-ramp completado — $${order.amount} a cuenta bancaria BO (PSAV)`,
    });

    // Liberar reserva
    await this.supabase.rpc('release_reserved_balance', {
      p_user_id: order.user_id,
      p_currency: (order.currency ?? 'USDC').toUpperCase(),
      p_amount: totalReserved,
    });
  }

  // Audit log
  await this.supabase.from('audit_logs').insert({
    performed_by: actorId,
    action: 'COMPLETE_PAYMENT_ORDER',
    table_name: 'payment_orders',
    record_id: orderId,
    new_values: { status: 'completed', receipt_url: dto.receipt_url },
    source: 'admin_panel',
  });

  // Notificación
  await this.supabase.from('notifications').insert({
    user_id: order.user_id,
    type: 'financial',
    title: 'Orden Completada',
    message: `Tu orden de pago ha sido completada exitosamente.`,
    reference_type: 'payment_order',
    reference_id: orderId,
  });

  // Activity log
  await this.supabase.from('activity_logs').insert({
    user_id: order.user_id,
    action: 'PAYMENT_ORDER_COMPLETED',
    description: `Orden ${orderId} (${order.flow_type}) completada por admin`,
  });

  return updated;
}
```

### `POST /admin/payment-orders/:id/fail`

```typescript
async failOrder(orderId: string, actorId: string, dto: FailOrderDto) {
  const { data: order } = await this.supabase
    .from('payment_orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) throw new NotFoundException('Orden no encontrada');
  if (['completed', 'failed', 'cancelled'].includes(order.status))
    throw new BadRequestException(
      `No se puede fallar una orden en estado "${order.status}"`,
    );

  const { data: updated, error } = await this.supabase
    .from('payment_orders')
    .update({
      status: 'failed',
      failure_reason: dto.reason,
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new BadRequestException(error.message);

  // Si tenía saldo reservado, liberarlo
  const outboundFlows = [
    'bridge_wallet_to_crypto',
    'bridge_wallet_to_fiat_us',
    'bridge_wallet_to_fiat_bo',
  ];

  if (outboundFlows.includes(order.flow_type ?? '')) {
    const totalReserved =
      parseFloat(order.amount ?? '0') + parseFloat(order.fee_amount ?? '0');

    // Fallar ledger entries pendientes
    await this.supabase
      .from('ledger_entries')
      .update({ status: 'failed' })
      .eq('reference_type', 'payment_order')
      .eq('reference_id', orderId)
      .eq('status', 'pending');

    // Liberar reserva
    await this.supabase.rpc('release_reserved_balance', {
      p_user_id: order.user_id,
      p_currency: (order.currency ?? 'USDC').toUpperCase(),
      p_amount: totalReserved,
    });
  }

  // Audit log
  await this.supabase.from('audit_logs').insert({
    performed_by: actorId,
    action: 'FAIL_PAYMENT_ORDER',
    table_name: 'payment_orders',
    record_id: orderId,
    new_values: { status: 'failed', failure_reason: dto.reason },
    source: 'admin_panel',
  });

  // Notificación al usuario (si se solicita)
  if (dto.notify_user !== false) {
    await this.supabase.from('notifications').insert({
      user_id: order.user_id,
      type: 'alert',
      title: 'Orden de Pago Fallida',
      message: `Tu orden de pago no pudo ser procesada. Motivo: ${dto.reason}`,
      reference_type: 'payment_order',
      reference_id: orderId,
    });
  }

  return updated;
}
```

---

## 5.4 Endpoint de Listado Admin

### `GET /admin/payment-orders`

```typescript
async listAllOrders(filters: {
  status?: string;
  flow_type?: string;
  flow_category?: string;
  requires_psav?: boolean;
  user_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  let query = this.supabase
    .from('payment_orders')
    .select(
      `*,
       profiles!payment_orders_user_id_fkey(email, full_name),
       wallets!payment_orders_wallet_id_fkey(currency, network, address)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Filtros
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.flow_type) query = query.eq('flow_type', filters.flow_type);
  if (filters.flow_category) query = query.eq('flow_category', filters.flow_category);
  if (filters.requires_psav !== undefined)
    query = query.eq('requires_psav', filters.requires_psav);
  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.from_date) query = query.gte('created_at', filters.from_date);
  if (filters.to_date) query = query.lte('created_at', filters.to_date);

  const { data, count, error } = await query;
  if (error) throw new BadRequestException(error.message);

  return {
    data,
    total: count,
    page,
    limit,
  };
}
```

---

## 5.5 Dashboard Admin — Estadísticas Rápidas

### `GET /admin/payment-orders/stats`

```typescript
async getOrderStats() {
  // Contar por estado
  const { data: statsByStatus } = await this.supabase
    .from('payment_orders')
    .select('status')
    .not('status', 'in', '("completed","failed","cancelled")');

  // Contar órdenes PSAV pendientes
  const { count: psavPending } = await this.supabase
    .from('payment_orders')
    .select('*', { count: 'exact', head: true })
    .eq('requires_psav', true)
    .in('status', ['waiting_deposit', 'deposit_received']);

  return {
    pending_review: statsByStatus?.filter(s => s.status === 'deposit_received').length ?? 0,
    waiting_deposit: statsByStatus?.filter(s => s.status === 'waiting_deposit').length ?? 0,
    processing: statsByStatus?.filter(s => s.status === 'processing').length ?? 0,
    sent: statsByStatus?.filter(s => s.status === 'sent').length ?? 0,
    psav_pending: psavPending ?? 0,
  };
}
```

---

## 5.6 Resumen de TODOS los Endpoints Nuevos

### Endpoints de Usuario (8)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/payment-orders/interbank` | Crear orden interbancaria |
| `POST` | `/payment-orders/wallet-ramp` | Crear orden rampa |
| `GET` | `/payment-orders` | Listar mis órdenes |
| `GET` | `/payment-orders/:id` | Detalle de una orden |
| `POST` | `/payment-orders/:id/confirm-deposit` | Subir comprobante de depósito |
| `POST` | `/payment-orders/:id/cancel` | Cancelar orden |
| `GET` | `/payment-orders/exchange-rates` | Ver tipos de cambio |
| `GET` | `/payment-orders/exchange-rates/:pair` | Ver tipo de cambio específico |

### Endpoints Admin (10)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/admin/payment-orders` | Listar todas las órdenes (filtros) |
| `GET` | `/admin/payment-orders/stats` | Estadísticas dashboard |
| `GET` | `/admin/payment-orders/:id` | Detalle admin de una orden |
| `POST` | `/admin/payment-orders/:id/approve` | Aprobar orden PSAV |
| `POST` | `/admin/payment-orders/:id/mark-sent` | Marcar como enviada |
| `POST` | `/admin/payment-orders/:id/complete` | Completar orden |
| `POST` | `/admin/payment-orders/:id/fail` | Fallar orden |
| `GET` | `/admin/psav-accounts` | Listar cuentas PSAV |
| `POST` | `/admin/psav-accounts` | Crear cuenta PSAV |
| `PUT` | `/admin/psav-accounts/:id` | Actualizar cuenta PSAV |
| `GET` | `/admin/exchange-rates` | Listar tipos de cambio |
| `PUT` | `/admin/exchange-rates/:pair` | Actualizar tipo de cambio |
