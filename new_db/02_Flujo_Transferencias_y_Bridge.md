# Flujo 02: Transferencias, Depósitos y Retiros con Bridge API

Este documento describe en detalle cómo el dinero entra y sale de la plataforma utilizando las capacidades de Bridge API, y cómo se refleja en el balance del cliente y el ledger contable interno.

---

## 💰 FLUJO A: Recepción de Dinero (Pay-In) via Virtual Accounts

### Tablas: `bridge_virtual_accounts`, `bridge_virtual_account_events`, `payment_orders`, `ledger_entries`, `balances`, `notifications`, `webhook_events`

### Paso 1: Creación de la Cuenta Virtual (una sola vez por cliente)

```
[Sistema Backend] → POST https://api.bridge.xyz/v0/customers/{bridge_customer_id}/virtual_accounts
    Payload: {
        "source": { "currency": "usd" },
        "destination": {
            "payment_rail": "ethereum",
            "currency": "usdc",
            "address": wallets.address   ← dirección real de la wallet Bridge del cliente
        },
        "developer_fee_percent": "1.0"
    }

Bridge responde con:
    {
        "id": "va_xxx",
        "status": "activated",
        "source_deposit_instructions": {
            "bank_name": "Lead Bank",
            "bank_routing_number": "101019644",
            "bank_account_number": "215268120000",
            "bank_beneficiary_name": "Tech Corp SA",
            "payment_rails": ["ach_push", "wire"]
        }
    }

[Sistema] → INSERT INTO bridge_virtual_accounts (
    user_id,
    bridge_virtual_account_id = "va_xxx",
    source_currency = "usd",
    destination_currency = "usdc",
    destination_payment_rail = "ethereum",
    destination_address = wallets.address,  ← address de la wallet del cliente en Bridge
    bank_name, routing_number, account_number,
    developer_fee_percent = 1.0,
    status = "activated"
)
```

> **Nota:** `destination_address` apunta a la dirección real de la `wallets` del cliente (emitida por Bridge). Cuando llega un Wire, Bridge convierte USD → USDC y deposita en esa dirección.

### Paso 2: Tercero Envía Wire o ACH

```
[Tercero] → Envía Wire/ACH al routing y account number de la Virtual Account
    │
    └── Bridge detecta el depósito → Envía Webhook POST
            │
            └── [Sistema] → INSERT INTO webhook_events (
                                provider = 'bridge',
                                event_type = 'virtual_account.funds_received',
                                provider_event_id = 'evt_bridge_xyz',
                                raw_payload = { ... payload completo ... },
                                status = 'pending'
                            )
            ← Responde HTTP 200 inmediatamente ← Bridge no reintenta
```

### Paso 3: Worker Asíncrono Procesa el Webhook

```
[CRON Worker — cada 30s] → SELECT * FROM webhook_events WHERE status = 'pending'
    │
    ├── INSERT INTO bridge_virtual_account_events (
    │       bridge_virtual_account_id,
    │       bridge_event_id = 'evt_bridge_xyz',
    │       event_type = 'virtual_account.funds_received',
    │       amount = 5050.00, currency = 'usd',
    │       sender_name = 'Acme Corp',
    │       raw_payload
    │   )
    │
    ├── INSERT INTO payment_orders (
    │       user_id, wallet_id,
    │       source_type = 'bridge_virtual_account',
    │       source_reference_id = bridge_virtual_account_id,
    │       amount = 5050.00, fee_amount = 50.50, net_amount = 4999.50,
    │       currency = 'usd', status = 'completed',
    │       bridge_event_id = 'evt_bridge_xyz'
    │   )
    │
    ├── INSERT INTO ledger_entries (
    │       wallet_id,
    │       type = 'deposit', amount = +4999.50,    ← POSITIVO (neto)
    │       currency = 'USDC', status = 'settled',
    │       reference_type = 'payment_order',
    │       description = 'Wire recibido via Bridge Virtual Account — Acme Corp'
    │   )
    │
    ├── [Trigger PostgreSQL] → UPDATE balances SET
    │       amount = amount + 4999.50,
    │       available_amount = amount + 4999.50 - reserved_amount
    │       WHERE user_id = X AND currency = 'USDC'
    │
    ├── UPDATE webhook_events SET status = 'processed', processed_at = NOW()
    │
    └── INSERT INTO notifications (
            user_id,
            type = 'financial',
            title = 'Depósito Confirmado',
            message = 'Recibiste $4,999.50 USDC en tu cuenta.'
        )
```

---

## 🌍 FLUJO B: Transferencia Saliente (Payout) via Bridge Transfers

### Tablas: `balances`, `payout_requests`, `bridge_external_accounts`, `bridge_transfers`, `ledger_entries`, `certificates`

### Paso 1: Cliente Registra su Cuenta Bancaria Destino

```
[Sistema Backend] → POST https://api.bridge.xyz/v0/customers/{bridge_customer_id}/external_accounts
    Payload: {
        "currency": "usd",
        "account": {
            "routing_number": "026009593",
            "account_number": "987654321",
            "account_type": "checking"
        },
        "owner": { "name": "Tech Corp SA", "type": "business" }
    }

Bridge responde: { "id": "ext_acct_xyz", ... }

[Sistema] → INSERT INTO bridge_external_accounts (
    user_id,
    bridge_external_account_id = 'ext_acct_xyz',
    bank_name = 'Chase Bank',
    account_last_4 = '4321',
    currency = 'usd', is_active = true
)
```

### Paso 2: Cliente Crea una Solicitud de Retiro

```
[Cliente] → Solicita payout de $2,000 USD hacia su cuenta bancaria
    │
    ├── [Sistema verifica saldo disponible]
    │       SELECT available_amount FROM balances
    │       WHERE user_id = X AND currency = 'USD'
    │       → Si available_amount >= 2000 → continúa ✅
    │
    ├── INSERT INTO payout_requests (
    │       user_id, wallet_id,
    │       bridge_external_account_id = 'ext_acct_xyz',
    │       amount = 2000.00,
    │       fee_amount = 10.00,     ← calculado desde fees_config o customer_fee_overrides
    │       net_amount = 1990.00,
    │       currency = 'USD',
    │       status = 'pending_review',
    │       idempotency_key = 'idm_uid_generado',
    │       business_purpose = 'Supplier payment — INV-2026-041'
    │   )
    │
    └── [Sistema reserva el saldo]
            UPDATE balances SET
                reserved_amount = reserved_amount + 2000.00,
                available_amount = available_amount - 2000.00
            WHERE user_id = X AND currency = 'USD'
```

### Paso 3: Aprobación de Compliance (si aplica)

```
[Si payout_requests.amount > app_settings.'PAYOUT_REVIEW_THRESHOLD']:
    INSERT INTO compliance_reviews (
        subject_type = 'payout_request',
        subject_id = payout_requests.id,
        status = 'open', priority = 'normal'
    )
    ← Staff aprueba via compliance_review_events.decision = 'APPROVED'

[Si el monto es menor al umbral]:
    UPDATE payout_requests SET status = 'approved'   ← aprobación automática
```

### Paso 4: Ejecución del Pago via Bridge

```
[Sistema Backend] → POST https://api.bridge.xyz/v0/transfers
    Headers: { "Idempotency-Key": payout_requests.idempotency_key }
    Payload: {
        "on_behalf_of": profiles.bridge_customer_id,
        "developer_fee_percent": "0.5",
        "source": {
            "payment_rail": "usdc",
            "currency": "usdc",
            "from_address": wallets.address   ← dirección de la wallet Bridge del cliente
        },
        "destination": {
            "payment_rail": "wire",
            "currency": "usd",
            "external_account_id": "ext_acct_xyz"
        },
        "amount": "2000.00",
        "currency": "usd",
        "on_behalf_of": "cust_bridge_xxx"
    }

Bridge responde: { "id": "trans_abc", "status": "processing" }

[Sistema] → INSERT INTO bridge_transfers (
    user_id, payout_request_id,
    bridge_transfer_id = 'trans_abc',
    idempotency_key, amount, fee_amount, net_amount,
    status = 'processing',
    source_payment_rail = 'usdc',
    destination_payment_rail = 'wire',
    destination_currency = 'usd'
)

[Sistema] → INSERT INTO ledger_entries (
    wallet_id,
    type = 'withdrawal', amount = -2010.00,   ← NEGATIVO (monto + fee)
    currency = 'USDC', status = 'settled',
    reference_type = 'payout_request'
)

[Trigger PostgreSQL] → UPDATE balances SET
    amount = amount - 2010.00,
    reserved_amount = reserved_amount - 2000.00,
    ← (reserved_amount ya se ajustó en Paso 2)
WHERE user_id = X AND currency = 'USDC'
```

### Paso 5: Bridge Confirma el Pago

```
Bridge → POST /webhooks/bridge { "type": "transfer.complete", "data": { "id": "trans_abc" } }
    │
    └── INSERT INTO webhook_events (pending) → CRON procesa →
            ├── UPDATE bridge_transfers SET status = 'completed', completed_at = NOW()
            ├── UPDATE payout_requests SET status = 'completed', completed_at = NOW()
            ├── INSERT INTO certificates (user_id, subject_type='payout_request', ...)
            └── INSERT INTO notifications (user_id, 'Retiro completado exitosamente')
```

---

## 🔁 FLUJO C: Liquidación Blockchain (Liquidation Addresses)

### Tablas: `bridge_liquidation_addresses`, `ledger_entries`, `balances`, `webhook_events`

Utilizado cuando el cliente envía USDC desde una wallet externa y quiere recibirlo en fiat (USD) en su banco:

```
[Sistema] → POST https://api.bridge.xyz/v0/customers/{id}/liquidation_addresses
    Payload: {
        "chain": "ethereum",
        "currency": "usdc",
        "destination_payment_rail": "ach",
        "destination_currency": "usd",
        "destination_external_account_id": "ext_acct_xyz",
        "developer_fee_percent": "0.5"
    }

Bridge responde: { "id": "liq_addr_xxx", "address": "0xBridgeLiqAddress..." }

[Sistema] → INSERT INTO bridge_liquidation_addresses (
    user_id, bridge_liquidation_address_id = 'liq_addr_xxx',
    chain = 'ethereum', address = '0xBridgeLiqAddress...',
    destination_external_account_id = 'ext_acct_xyz',
    developer_fee_percent = 0.5
)
```

Cuando el cliente envía USDC a esa dirección:
```
Bridge detecta el depósito → webhook_events (pending)
    → CRON procesa → INSERT ledger_entries (deposit)
    → UPDATE balances (saldo USD aumenta)
    → INSERT notifications (fondos convertidos y enviados a banco)
```

---

## 📊 Consulta de Saldo: Modelo Híbrido

El saldo de un usuario se consulta directamente de `balances` (no calculado):

```sql
-- Saldo instantáneo del cliente:
SELECT currency, amount, available_amount, pending_amount
FROM balances
WHERE user_id = :user_id;

-- Historial de movimientos para estado de cuenta:
SELECT le.type, le.amount, le.currency, le.description, le.created_at
FROM ledger_entries le
JOIN wallets w ON le.wallet_id = w.id
WHERE w.user_id = :user_id
ORDER BY le.created_at DESC
LIMIT 50;
```

| Tipo de Entry | Signo del Amount | Efecto en `balances.amount` |
|---|---|---|
| `deposit` | Positivo (+) | Aumenta |
| `withdrawal` | Negativo (-) | Disminuye |
| `fee` | Negativo (-) | Disminuye |
| `adjustment` | + o - | Aumenta o disminuye según Staff |
| `reversal` | Positivo (+) | Aumenta (devolución) |
