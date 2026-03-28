# FASE 4 — Integración Bridge API Completa
> **Duración estimada:** 5-6 días  
> **Dependencias:** Fase 3 (Wallets, Ledger, Fees funcionando) + `bridge_customer_id` en profiles  
> **Módulo NestJS:** `bridge/` (refactor mayor) + `suppliers/` (nuevo)

---

## Objetivo

Implementar la integración completa con **Bridge API v0** (`api.bridge.xyz`):
- **Virtual Accounts** — Cuentas para recibir Wire/ACH/SEPA/SPEI/PIX
- **External Accounts** — Cuentas bancarias destino registradas en Bridge
- **Transfers** — Motor de pagos salientes (payouts crypto → fiat)
- **Liquidation Addresses** — Conversión automática Crypto → Fiat
- **Suppliers** — Proveedores recurrentes pre-verificados para pagos B2B

Esta fase es la más crítica del proyecto. Un error aquí puede resultar en pérdida de dinero real.

---

## 📋 CHECKLIST DE ESTA FASE

### Virtual Accounts (Depósitos entrantes)
- [ ] F4.1 — `POST /bridge/virtual-accounts` — crea Virtual Account en Bridge + guarda en DB
- [ ] F4.2 — `GET /bridge/virtual-accounts` — lista cuentas virtuales del usuario con instrucciones de depósito
- [ ] F4.3 — `GET /bridge/virtual-accounts/:id` — detalle con `source_deposit_instructions`
- [ ] F4.4 — `DELETE /bridge/virtual-accounts/:id` — desactiva cuenta virtual en Bridge + DB
- [ ] F4.5 — Lógica: verificar que no exista VA activa del mismo `source_currency` antes de crear otra

### External Accounts (Cuentas bancarias destino)
- [ ] F4.6 — `POST /bridge/external-accounts` — registra cuenta bancaria en Bridge + guarda en DB
- [ ] F4.7 — `GET /bridge/external-accounts` — lista cuentas registradas activas
- [ ] F4.8 — `DELETE /bridge/external-accounts/:id` — desactiva cuenta en Bridge + DB
- [ ] F4.9 — Soporte: ACH (routing + account), Wire (SWIFT/BIC), SEPA (IBAN), SPEI (CLABE)

### Transfers / Payouts (Pagos salientes)
- [ ] F4.10 — `POST /bridge/payouts` — crear solicitud de pago (refactor completo)
  - Verificar `onboarding_status = 'approved'`
  - Verificar `is_frozen = false`
  - Calcular fee via `FeesService.calculateFee()`
  - Verificar `available_amount >= amount + fee`
  - Verificar límites en `transaction_limits`
  - Verificar `PAYOUT_REVIEW_THRESHOLD` desde `app_settings`
  - Reservar saldo en `balances`
  - INSERT `payout_requests` con `idempotency_key` único
  - Si monto < threshold → auto-aprobar y llamar a Bridge
  - Si monto >= threshold → crear `compliance_review` para aprobación manual
- [ ] F4.11 — `GET /bridge/payouts` — lista solicitudes (con estados)
- [ ] F4.12 — `GET /bridge/payouts/:id` — detalle de solicitud
- [ ] F4.13 — `POST /admin/bridge/payouts/:id/approve` — aprobación manual (Admin/Staff)
- [ ] F4.14 — `POST /admin/bridge/payouts/:id/reject` — rechazo (libera reserved_amount)
- [ ] F4.15 — Servicio interno: `executePayout(payoutRequestId)` — llama Bridge POST /v0/transfers
- [ ] F4.16 — Manejar respuesta de Bridge: INSERT `bridge_transfers`, INSERT `ledger_entries`

### Transfers — Consultas
- [ ] F4.17 — `GET /bridge/transfers` — historial de transferencias ejecutadas
- [ ] F4.18 — `GET /bridge/transfers/:id` — detalle con receipt (fees, tasas de cambio, tx_hash)
- [ ] F4.19 — `POST /bridge/transfers/:id/sync` — sincronización manual con Bridge API

### Liquidation Addresses
- [ ] F4.20 — `POST /bridge/liquidation-addresses` — crea dirección de liquidación en Bridge
- [ ] F4.21 — `GET /bridge/liquidation-addresses` — lista direcciones activas del usuario
- [ ] F4.22 — `DELETE /bridge/liquidation-addresses/:id` — desactiva dirección

### Suppliers (Proveedores en B2B)
- [ ] F4.23 — `POST /suppliers` — crear proveedor (nombre, banco, IBAN/CLABE, email)
- [ ] F4.24 — `GET /suppliers` — lista proveedores del usuario
- [ ] F4.25 — `GET /suppliers/:id` — detalle de proveedor
- [ ] F4.26 — `PATCH /suppliers/:id` — actualizar proveedor
- [ ] F4.27 — `DELETE /suppliers/:id` — marcar inactivo
- [ ] F4.28 — `POST /bridge/payouts` soportar `supplier_id` como destino (en lugar de `bridge_external_account_id`)

### Bridge Pull Jobs (Admin)
- [ ] F4.29 — `POST /admin/bridge/pull-jobs` — lanzar job de sincronización forzada
- [ ] F4.30 — `GET /admin/bridge/pull-jobs` — historial de pull jobs
- [ ] F4.31 — Servicio interno: `runPullJob(params)` — descarga transfers de Bridge, detecta gaps, crea ledger recovery entries

---

## 🏗️ ARQUITECTURA DEL MÓDULO

```
src/application/
├── bridge/                           ← REFACTORIZAR (refactor mayor)
│   ├── bridge.module.ts
│   ├── bridge.controller.ts          ← expandir endpoints
│   ├── bridge.service.ts             ← refactorizar + completar
│   ├── bridge-api.client.ts         ← NUEVO: cliente HTTP tipado para Bridge API
│   ├── bridge-pull.service.ts       ← NUEVO: lógica de pull jobs y sync
│   └── dto/
│       ├── create-virtual-account.dto.ts
│       ├── create-external-account.dto.ts
│       ├── create-payout.dto.ts      ← refactorizar (usar schema v2)
│       ├── create-liquidation.dto.ts
│       └── bridge-transfer-response.dto.ts
│
└── suppliers/                        ← NUEVO MÓDULO
    ├── suppliers.module.ts
    ├── suppliers.controller.ts
    ├── suppliers.service.ts
    └── dto/
        ├── create-supplier.dto.ts
        └── supplier-response.dto.ts
```

---

## 🔑 BRIDGE API CLIENT (Tipado)

Crear un cliente HTTP centralizado para todas las llamadas a Bridge:

```typescript
// bridge-api.client.ts
@Injectable()
export class BridgeApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get('app.bridgeApiUrl');
    this.headers = {
      'Api-Key': config.get('app.bridgeApiKey'),
      'Content-Type': 'application/json',
    };
  }

  async post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        ...this.headers,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new BadGatewayException(`Bridge API error [${res.status}]: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> { /* ... */ }
  async delete<T>(path: string): Promise<T> { /* ... */ }
}
```

---

## 🔄 FLUJO COMPLETO DE PAYOUT

```typescript
async createAndExecutePayout(userId: string, dto: CreatePayoutDto) {
  // PASO 1: Validar perfil y estado
  const profile = await this.validateProfileForPayout(userId);

  // PASO 2: Calcular fee
  const { fee_amount, net_amount } = await this.feesService.calculateFee(
    userId, 'payout', dto.payment_rail, dto.amount
  );

  // PASO 3: Verificar saldo y límites
  await this.verifyBalanceAndLimits(userId, dto.currency, dto.amount + fee_amount);

  // PASO 4: Generar idempotency key
  const idempotency_key = `payout-${userId}-${Date.now()}-${crypto.randomUUID()}`;

  // PASO 5: Reservar saldo
  await this.supabase.rpc('reserve_balance', {
    p_user_id: userId, p_currency: dto.currency, p_amount: dto.amount
  });

  // PASO 6: Crear payout_request en DB
  const { data: payoutReq } = await this.supabase.from('payout_requests').insert({
    user_id: userId,
    wallet_id: dto.wallet_id,
    bridge_external_account_id: dto.bridge_external_account_id,
    supplier_id: dto.supplier_id,
    payment_rail: dto.payment_rail,
    amount: dto.amount,
    fee_amount,
    net_amount,
    currency: dto.currency,
    idempotency_key,
    business_purpose: dto.business_purpose,
    status: 'pending',
  }).select().single();

  // PASO 7: ¿Requiere revisión de compliance?
  const threshold = parseFloat(await this.getAppSetting('PAYOUT_REVIEW_THRESHOLD'));
  if (dto.amount >= threshold) {
    await this.createComplianceReview('payout_request', payoutReq.id);
    return { ...payoutReq, requires_review: true };
  }

  // PASO 8: Aprobación automática → ejecutar en Bridge
  return await this.executePayout(payoutReq.id, profile.bridge_customer_id);
}

async executePayout(payoutRequestId: string, bridgeCustomerId: string) {
  const { data: req } = await this.supabase
    .from('payout_requests')
    .select('*, wallets(*), bridge_external_accounts(*)')
    .eq('id', payoutRequestId).single();

  // Llamar Bridge Transfer API
  const bridgeTransfer = await this.bridgeApiClient.post<BridgeTransferResponse>(
    '/v0/transfers',
    {
      on_behalf_of: bridgeCustomerId,
      source: {
        payment_rail: 'usdc',
        currency: 'usdc',
        from_address: req.wallets.address,
      },
      destination: {
        payment_rail: req.payment_rail,
        currency: req.currency.toLowerCase(),
        external_account_id: req.bridge_external_accounts.bridge_external_account_id,
      },
      amount: req.amount.toString(),
      developer_fee_percent: '0.5',
    },
    req.idempotency_key,
  );

  // Guardar bridge_transfer
  await this.supabase.from('bridge_transfers').insert({
    user_id: req.user_id,
    payout_request_id: req.id,
    bridge_transfer_id: bridgeTransfer.id,
    idempotency_key: req.idempotency_key,
    amount: req.amount,
    status: 'processing',
    bridge_state: bridgeTransfer.status,
    // ...
  });

  // Crear ledger entry de débito
  await this.ledgerService.createLedgerEntry({
    wallet_id: req.wallet_id,
    type: 'debit',
    amount: req.amount + req.fee_amount,
    currency: req.currency,
    status: 'settled',
    reference_type: 'payout_request',
    reference_id: req.id,
    description: `Pago enviado — ${req.business_purpose}`,
  });

  // Actualizar estados
  await this.supabase.from('payout_requests')
    .update({ status: 'processing' }).eq('id', req.id);

  return { bridge_transfer_id: bridgeTransfer.id, status: 'processing' };
}
```

---

## 🏦 SOPORTE MULTI-RAIL

| Payment Rail | Moneda | Campos requeridos |
|---|---|---|
| `ach_push` / `ach` | USD | routing_number, account_number |
| `wire` | USD | routing_number, account_number, bank_name |
| `sepa` | EUR | IBAN, SWIFT/BIC |
| `spei` | MXN | CLABE |
| `pix` | BRL | br_code / cuenta PIX |

---

## ⚠️ IDEMPOTENCIA — CRÍTICO

Toda llamada a Bridge que crea recursos DEBE incluir `Idempotency-Key`:
- Generación: `${userId}-${operation}-${Date.now()}-${uuid4()}`
- Almacenamiento: campo `idempotency_key` en `payout_requests` y `bridge_transfers`
- Si Bridge responde 409 (ya existe) → recuperar el transfer existente, no crear nuevo

---

## ✅ CRITERIOS DE ACEPTACIÓN

1. Un cliente puede crear Virtual Account y recibir instrucciones bancarias reales
2. Un payout < umbrral se ejecuta automáticamente en Bridge con idempotency key
3. Un payout ≥ umbral queda en `pending` y genera `compliance_review` para el Staff
4. Los transfers fallidos liberan el `reserved_amount` correctamente
5. Los proveedores (suppliers) se pueden usar como destino de payouts
6. Los pull jobs detectan gaps y crean `ledger_entries` de recuperación

---

## 🔗 SIGUIENTE FASE

Con Bridge integrado → **[FASE 5: Webhooks y CRON Worker](./06_FASE_5_Webhooks_Worker.md)**
