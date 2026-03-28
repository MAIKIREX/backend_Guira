# FASE 5 — Webhooks + CRON Worker (Refactor Completo)
> **Duración estimada:** 3-4 días  
> **Dependencias:** Fase 4 (Bridge integrado) + Fase 3 (Ledger funcional)  
> **Módulo NestJS:** `webhooks/` (refactor crítico)

---

## Objetivo

Corregir y completar el sistema de Webhook Sink que ya existe en el código pero tiene referencias a columnas incorrectas del schema antiguo. Este sistema es el corazón de la fiabilidad asíncrona: garantiza que ningún depósito ni estado de transferencia se pierda.

### Errores actuales del WebhooksService que deben corregirse:

1. `handleFundsReceived()` → Busca por `.eq('va_id', vaId)` pero la columna real es `bridge_virtual_account_id`
2. `handleFundsReceived()` → Inserta en `ledger_entries` con campos incorrectos (`user_id` no existe — debe usar `wallet_id`)
3. `handleKycApproved()` → Busca por `kyc_link_id` pero la columna real es `bridge_kyc_link_id`
4. `handleKybApproved()` → Busca por `bridge_customer_id` en `kyb_applications` pero esa columna no existe ahí
5. `handleLiquidationPayment()` → Busca por `bridge_address_id` pero la columna real es `bridge_liquidation_address_id`
6. Los ledger entries no incluyen `bridge_transfer_id` cuando aplica

---

## 📋 CHECKLIST DE ESTA FASE

### Webhook Sink (Controller)
- [ ] F5.1 — `POST /webhooks/bridge` — recibe webhook, inserta en `webhook_events`, retorna HTTP 200 inmediato
- [ ] F5.2 — Extraer correctamente: `provider_event_id`, `event_type`, `raw_payload`, `headers`, `bridge_api_version`
- [ ] F5.3 — Verificación de firma HMAC-SHA256 antes de insertar (marcar `signature_verified`)
- [ ] F5.4 — Idempotencia: ON CONFLICT en `provider_event_id` → ignorar duplicados

### CRON Worker (Service)
- [ ] F5.5 — Verificar que `@Cron('*/30 * * * * *')` funciona con `@nestjs/schedule`
- [ ] F5.6 — Procesamiento FIFO: `ORDER BY received_at ASC LIMIT 50`
- [ ] F5.7 — Manejo de errores: retry_count + 1, status = 'failed' si retry_count >= 5
- [ ] F5.8 — Alert para Admin si evento falla 5 veces → `INSERT notifications`

### Handlers — REFACTORIZAR TODOS

- [ ] F5.9 — `handleFundsReceived()` — corregir columnas y flujo completo:
  - Buscar VA por `bridge_virtual_account_id`
  - Calcular fee via `FeesService`
  - INSERT `payment_orders`
  - INSERT `ledger_entries` (wallet_id, type='credit', status='settled')
  - Trigger actualiza `balances`
  - INSERT `notifications` al cliente
  - UPDATE `webhook_events.status = 'processed'`

- [ ] F5.10 — `handleTransferPaymentProcessed()` — actualizar `bridge_transfers.bridge_state`

- [ ] F5.11 — `handleTransferComplete()` — flujo completo:
  - UPDATE `bridge_transfers.status = 'completed'`
  - UPDATE `payout_requests.status = 'completed'`
  - INSERT `certificates` (PDF del comprobante)
  - INSERT `notifications` al cliente
  - INSERT `activity_logs`

- [ ] F5.12 — `handleTransferFailed()` — flujo completo:
  - UPDATE `bridge_transfers.status = 'failed'`
  - UPDATE `payout_requests.status = 'failed'`
  - INSERT `ledger_entries` (type='reversal', amount=+amount) — devuelve el dinero
  - UPDATE `balances` via trigger
  - INSERT `notifications` al cliente informando fallo + devolución

- [ ] F5.13 — `handleKycApproved()` — corregir y completar:
  - Buscar por `bridge_kyc_links.bridge_kyc_link_id`
  - UPDATE `kyc_applications.status = 'approved'`
  - UPDATE `profiles.onboarding_status = 'approved'`
  - Llamar `registerCustomerInBridge()` si aún no tiene `bridge_customer_id`
  - Inicializar `wallets` y `balances`
  - INSERT `notifications`

- [ ] F5.14 — `handleKybApproved()` — corregir:
  - Buscar por `profiles.bridge_customer_id` (es en profiles donde se guarda)
  - UPDATE `kyb_applications.status = 'approved'`
  - UPDATE `profiles.onboarding_status = 'approved'`
  - Inicializar wallets y balances
  - INSERT `notifications`

- [ ] F5.15 — `handleLiquidationPayment()` — corregir columnas:
  - Buscar por `bridge_liquidation_addresses.bridge_liquidation_address_id`
  - INSERT `ledger_entries` (wallet_id del usuario, type='credit')
  - INSERT `notifications`

---

## 🏗️ ARQUITECTURA REFACTORIZADA

```
src/application/webhooks/
├── webhooks.module.ts
├── webhooks.controller.ts       ← recibe webhook HTTP, persiste, retorna 200
├── webhooks.service.ts          ← CRON worker + dispatch
├── handlers/                    ← NUEVO: un handler por event_type
│   ├── funds-received.handler.ts
│   ├── transfer-complete.handler.ts
│   ├── transfer-failed.handler.ts
│   ├── kyc-approved.handler.ts
│   ├── kyb-approved.handler.ts
│   └── liquidation-payment.handler.ts
└── interfaces/
    └── bridge-webhook-payload.interface.ts
```

---

## 🔑 WEBHHOOK CONTROLLER (Correcto)

```typescript
@Post('bridge')
async receiveBridgeWebhook(
  @Headers() headers: Record<string, string>,
  @Body() payload: Record<string, unknown>,
): Promise<{ received: boolean }> {
  const dto = {
    provider: 'bridge',
    event_type: (payload.type as string) ?? 'unknown',
    provider_event_id: (payload.id as string) ?? null,
    raw_payload: payload,
    headers: {
      'x-bridge-signature': headers['x-bridge-signature'] ?? null,
      'x-bridge-api-version': headers['x-bridge-api-version'] ?? null,
    },
    bridge_api_version: headers['x-bridge-api-version'] ?? null,
  };

  await this.webhooksService.sinkEvent(dto);

  // CRÍTICO: Siempre retornar 200 inmediatamente
  // Bridge no reintenta si recibe 200
  return { received: true };
}
```

---

## 🔄 HANDLER: funds_received (Refactorizado)

```typescript
async handleFundsReceived(payload: BridgePayload): Promise<void> {
  const data = payload.data;
  const vaId = data.virtual_account_id as string;
  const amount = parseFloat(data.amount as string);
  const senderName = data.sender_name as string;

  // 1. Buscar VA — COLUMNA CORRECTA
  const { data: va } = await this.supabase
    .from('bridge_virtual_accounts')
    .select('user_id, destination_wallet_id, source_currency, developer_fee_percent')
    .eq('bridge_virtual_account_id', vaId)  // ← correcto
    .single();

  if (!va) throw new Error(`Virtual account no encontrada: ${vaId}`);

  // 2. Obtener wallet del usuario
  const { data: wallet } = await this.supabase
    .from('wallets')
    .select('id, currency')
    .eq('user_id', va.user_id)
    .eq('is_active', true)
    .single();

  if (!wallet) throw new Error(`Wallet no encontrada para user ${va.user_id}`);

  // 3. Calcular fee
  const developerFeePercent = va.developer_fee_percent ?? 1.0;
  const feeAmount = parseFloat((amount * developerFeePercent / 100).toFixed(2));
  const netAmount = parseFloat((amount - feeAmount).toFixed(2));

  // 4. INSERT payment_order
  const { data: order } = await this.supabase.from('payment_orders').insert({
    user_id: va.user_id,
    wallet_id: wallet.id,
    source_type: 'bridge_virtual_account',
    source_reference_id: vaId,
    amount,
    fee_amount: feeAmount,
    net_amount: netAmount,
    currency: va.source_currency ?? 'usd',
    sender_name: senderName,
    status: 'completed',
  }).select('id').single();

  // 5. INSERT ledger_entry — trigger actualiza balances
  await this.supabase.from('ledger_entries').insert({
    wallet_id: wallet.id,  // ← usar wallet_id, no user_id
    type: 'credit',
    amount: netAmount,
    currency: wallet.currency,
    status: 'settled',
    reference_type: 'payment_order',
    reference_id: order.id,
    description: `Depósito Wire recibido — ${senderName}`,
  });

  // 6. Notificar al cliente
  await this.supabase.from('notifications').insert({
    user_id: va.user_id,
    type: 'financial',
    title: 'Depósito Confirmado',
    message: `Recibiste $${netAmount.toFixed(2)} ${wallet.currency.toUpperCase()}`,
    reference_type: 'payment_order',
    reference_id: order.id,
  });

  // 7. Activity log
  await this.supabase.from('activity_logs').insert({
    user_id: va.user_id,
    action: 'DEPOSIT_RECEIVED',
    description: `Depósito de $${amount} recibido via Virtual Account`,
  });
}
```

---

## 📊 TIPOS DE EVENTOS BRIDGE SOPORTADOS

| event_type | Handler | Tablas afectadas |
|---|---|---|
| `virtual_account.funds_received` | handleFundsReceived | payment_orders, ledger_entries, balances, notifications |
| `transfer.payment_processed` | handleTransferPaymentProcessed | bridge_transfers |
| `transfer.complete` | handleTransferComplete | bridge_transfers, payout_requests, certificates, notifications |
| `transfer.failed` | handleTransferFailed | bridge_transfers, payout_requests, ledger_entries (reversal), balances, notifications |
| `kyc_link.approved` | handleKycApproved | kyc_applications, profiles, wallets, balances, notifications |
| `kyb_link.approved` | handleKybApproved | kyb_applications, profiles, wallets, balances, notifications |
| `liquidation_address.payment_completed` | handleLiquidationPayment | ledger_entries, balances, notifications |

---

## ✅ CRITERIOS DE ACEPTACIÓN

1. Enviar un webhook simulado → se guarda en `webhook_events` y retorna 200 < 100ms
2. CRON ejecuta y procesa el evento → ledger y balance actualizados correctamente
3. Enviar evento duplicado (mismo `provider_event_id`) → ignorado, no duplica ledger
4. Handler de `transfer.failed` → libera `reserved_amount` y notifica al cliente
5. Handler de `kyc_link.approved` → perfil queda con `onboarding_status = 'approved'` y `wallets` creadas
6. Evento con firma inválida en producción → marcado como `ignored`, no procesado

---

## 🔗 SIGUIENTE FASE

Con Webhooks funcionando → **[FASE 6: Compliance Admin](./07_FASE_6_Compliance_Admin.md)**
