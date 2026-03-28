# FASE 3 — Core Financiero: Wallets, Ledger y Balances
> **Duración estimada:** 3-4 días  
> **Dependencias:** Fase 0 (triggers del ledger activos) + Fase 2 (bridge_customer_id en profiles)  
> **Módulo NestJS:** `wallets/` (refactor) + `ledger/` (nuevo) + `fees/` (nuevo)

---

## Objetivo

Implementar el motor contable central de Guira:
- **Wallets**: Cuentas blockchain custodiadas por Bridge (con address real)
- **Balances**: Saldo consolidado mutable — actualizado automáticamente por triggers
- **Ledger**: Historial inmutable de todos los movimientos (créditos y débitos)
- **Fees**: Configuración de tarifas y cálculo dinámico

Este es el corazón financiero. Sin ledger funcional, ningún depósito ni retiro puede ser confiable.

---

## 📋 CHECKLIST DE ESTA FASE

### Wallets
- [ ] F3.1 — `GET /wallets` — lista wallets activas del usuario (address, network, currency)
- [ ] F3.2 — `GET /wallets/:id` — detalle de una wallet específica
- [ ] F3.3 — Servicio interno: `initializeClientWallets(userId, bridgeCustomerId)` — crea wallets via Bridge API
- [ ] F3.4 — Guardar wallet response de Bridge en `wallets` table (bridge_wallet_id, address, network)

### Balances
- [ ] F3.5 — `GET /wallets/balances` — saldos del usuario (amount, available_amount, pending_amount)
- [ ] F3.6 — `GET /wallets/balances/:currency` — saldo de una divisa específica
- [ ] F3.7 — Servicio interno: `initializeBalances(userId, currencies[])` — crea filas en balances (amount=0)
- [ ] F3.8 — `POST /admin/wallets/balances/adjust` — ajuste manual de balance (Admin) con audit_log

### Ledger
- [ ] F3.9 — `GET /ledger` — historial de movimientos del usuario (paginado, max 100)
- [ ] F3.10 — `GET /ledger/:id` — detalle de una entrada del ledger
- [ ] F3.11 — `GET /ledger?from=&to=&type=&currency=` — filtros para el historial
- [ ] F3.12 — Servicio interno: `createLedgerEntry(params)` — helper para crear movimientos
- [ ] F3.13 — Admin: `POST /admin/ledger/adjustment` — ajuste manual con justificación (audit trail)
- [ ] F3.14 — Verificar que trigger de balance se dispara correctamente (test integración)

### Fees
- [ ] F3.15 — `GET /fees` — lista tarifas vigentes (solo las públicas)
- [ ] F3.16 — `GET /admin/fees` — todas las tarifas (Admin)
- [ ] F3.17 — `POST /admin/fees` — crear nueva tarifa (Admin)
- [ ] F3.18 — `PATCH /admin/fees/:id` — actualizar tarifa (Admin)
- [ ] F3.19 — Servicio interno: `calculateFee(userId, operation_type, payment_rail, amount)` — calcula fee considerando overrides del cliente
- [ ] F3.20 — `GET /admin/fees/overrides/:userId` — overrides de fee para un usuario (Admin)
- [ ] F3.21 — `POST /admin/fees/overrides` — crear override de fee VIP (Admin)

### Payout Requests (Refactor)
- [ ] F3.22 — Refactorizar `BridgeService.createPayoutRequest()` — usar columnas correctas del schema v2
- [ ] F3.23 — Lógica de reserva de saldo: `UPDATE balances SET reserved_amount += amount` al crear pending payout
- [ ] F3.24 — Lógica de liberación: `UPDATE balances SET reserved_amount -= amount` al rechazar/fallar payout
- [ ] F3.25 — `GET /bridge/payouts` — lista solicitudes de pago del usuario
- [ ] F3.26 — `POST /bridge/payouts` — crear solicitud de pago (verificar saldo, crear payout_request)
- [ ] F3.27 — `GET /bridge/payouts/:id` — estado de una solicitud

---

## 🏗️ ARQUITECTURA DEL MÓDULO

```
src/application/
├── wallets/                      ← REFACTORIZAR
│   ├── wallets.module.ts
│   ├── wallets.controller.ts
│   ├── wallets.service.ts        ← implementar completo
│   └── dto/
│       ├── wallet-response.dto.ts
│       ├── balance-response.dto.ts
│       └── manual-adjustment.dto.ts
│
├── ledger/                       ← NUEVO MÓDULO
│   ├── ledger.module.ts
│   ├── ledger.controller.ts
│   ├── ledger.service.ts
│   └── dto/
│       ├── ledger-entry-response.dto.ts
│       └── create-adjustment.dto.ts
│
└── fees/                         ← NUEVO MÓDULO
    ├── fees.module.ts
    ├── fees.controller.ts
    ├── fees.service.ts
    └── dto/
        ├── create-fee.dto.ts
        └── create-fee-override.dto.ts
```

---

## 🔑 ENTIDADES Y LÓGICA CRÍTICA

### Modelo de Wallet

```typescript
// Wallet de Bridge: dirección blockchain real
interface Wallet {
  id: string;           // UUID interno
  user_id: string;
  currency: string;     // 'USDC', 'ETH', 'USD'
  address: string;      // '0x...' — dirección en la blockchain
  network: string;      // 'ethereum', 'polygon', 'base'
  provider_key: string; // 'bridge'
  provider_wallet_id: string; // ID in Bridge
  is_active: boolean;
}
```

### Inicialización de Cliente Aprobado

```typescript
async onClientApproved(userId: string, bridgeCustomerId: string): Promise<void> {
  // 1. Crear wallet USDC en red Ethereum via Bridge
  const walletRes = await this.createBridgeWallet(bridgeCustomerId, 'usdc', 'ethereum');

  // 2. Guardar wallet en DB
  await this.supabase.from('wallets').insert({
    user_id: userId,
    currency: 'USDC',
    address: walletRes.address,
    network: 'ethereum',
    provider_key: 'bridge',
    provider_wallet_id: walletRes.id,
  });

  // 3. Inicializar balances en USD y USDC
  await this.supabase.from('balances').insert([
    { user_id: userId, currency: 'USD',  amount: 0, available_amount: 0 },
    { user_id: userId, currency: 'USDC', amount: 0, available_amount: 0 },
  ]);
}
```

### Servicio de Cálculo de Fee

```typescript
async calculateFee(
  userId: string,
  operationType: string,
  paymentRail: string,
  amount: number,
): Promise<{ fee_amount: number; net_amount: number }> {
  // 1. Buscar override específico del cliente
  const { data: override } = await this.supabase
    .from('customer_fee_overrides')
    .select('*')
    .eq('user_id', userId)
    .eq('operation_type', operationType)
    .eq('is_active', true)
    .lte('valid_from', today)
    .gte('valid_until', today)  // si tienen fecha
    .maybeSingle();

  // 2. Si no hay override, usar tarifa global
  const feeConfig = override ?? await this.getGlobalFeeConfig(operationType, paymentRail);

  // 3. Calcular
  let fee = 0;
  if (feeConfig.fee_type === 'percent') {
    fee = amount * (feeConfig.fee_percent / 100);
  } else if (feeConfig.fee_type === 'fixed') {
    fee = feeConfig.fee_fixed;
  } else if (feeConfig.fee_type === 'mixed') {
    fee = Math.max(
      feeConfig.fee_fixed + amount * (feeConfig.fee_percent / 100),
      feeConfig.min_fee ?? 0
    );
  }

  // 4. Aplicar min/max
  if (feeConfig.min_fee) fee = Math.max(fee, feeConfig.min_fee);
  if (feeConfig.max_fee) fee = Math.min(fee, feeConfig.max_fee);

  return {
    fee_amount: parseFloat(fee.toFixed(2)),
    net_amount: parseFloat((amount - fee).toFixed(2)),
  };
}
```

### Servicio de Ledger (Helper central)

```typescript
interface CreateLedgerEntryParams {
  wallet_id: string;
  type: 'credit' | 'debit';
  amount: number;          // siempre positivo — el tipo indica la dirección
  currency: string;
  status: 'pending' | 'settled' | 'failed' | 'reversed';
  reference_type?: string; // 'payment_order', 'payout_request', 'bridge_transfer'
  reference_id?: string;
  bridge_transfer_id?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

async createLedgerEntry(params: CreateLedgerEntryParams): Promise<{ id: string }> {
  const { data, error } = await this.supabase
    .from('ledger_entries')
    .insert(params)
    .select('id')
    .single();

  if (error) throw new Error(`Error creando ledger entry: ${error.message}`);
  // El trigger de DB actualiza balances automáticamente cuando status = 'settled'
  return data;
}
```

---

## 🔄 FLUJO DE RESERVA DE SALDO (Payout)

```
Cliente solicita payout de $2,000 USD:

1. GET balances WHERE currency='USD'
   → available_amount = 5,000 ✅ suficiente

2. INSERT payout_requests { amount: 2,000, status: 'pending' }

3. UPDATE balances SET
     reserved_amount   = reserved_amount + 2000,
     available_amount  = available_amount - 2000
   WHERE user_id = X AND currency = 'USD'

4. Resultado: { amount: 5000, reserved: 2000, available: 3000 }

Si payout se rechaza:
5. UPDATE balances SET
     reserved_amount   = reserved_amount - 2000,
     available_amount  = available_amount + 2000

Si payout se ejecuta:
5. INSERT ledger_entries { type: 'debit', amount: 2000, status: 'settled' }
   → Trigger: UPDATE balances SET amount -= 2000, reserved -= 2000
```

---

## 📊 QUERIES DE SALDO RELEVANTES

```sql
-- Saldo completo del usuario
SELECT currency, amount, available_amount, pending_amount, reserved_amount
FROM balances
WHERE user_id = :user_id;

-- Historial con paginación
SELECT
  le.id, le.type, le.amount, le.currency,
  le.status, le.description, le.created_at,
  le.reference_type, le.reference_id
FROM ledger_entries le
JOIN wallets w ON le.wallet_id = w.id
WHERE w.user_id = :user_id
  AND (:from_date IS NULL OR le.created_at >= :from_date)
  AND (:to_date IS NULL OR le.created_at <= :to_date)
  AND (:type IS NULL OR le.type = :type)
ORDER BY le.created_at DESC
LIMIT 50 OFFSET :offset;
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

1. Al aprobar un cliente → se crean automáticamente sus wallets y balances iniciales en $0
2. `calculateFee()` respeta los overrides de cliente VIP sobre las tarifas globales
3. Al crear un `ledger_entry` con `status = 'settled'` → `balances` se actualiza (verificar con trigger)
4. Al crear un payout → el `available_amount` se reduce por el `reserved_amount`
5. El historial del ledger es paginable y filtrable por tipo, moneda y fechas

---

## 🔗 SIGUIENTE FASE

Con el motor financiero listo → **[FASE 4: Integración Bridge Completa](./05_FASE_4_Bridge_Integracion.md)**
