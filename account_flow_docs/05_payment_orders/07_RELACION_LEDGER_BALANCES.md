# 07 — Relación entre Payment Orders, Ledger Entries y Balances

> Este documento explica en detalle cómo una `payment_order` genera movimientos en el libro mayor (`ledger_entries`) y cómo estos impactan los saldos del usuario (`balances`).

---

## 🔗 Cadena de Datos Completa

```
payment_orders ──(genera)──→ ledger_entries ──(trigger DB)──→ balances
     │                            │                              │
     │                            │                              │
     ▼                            ▼                              ▼
  Registro del              Movimiento                    Saldo en tiempo
  depósito con              contable                      real del usuario
  metadatos                 inmutable
```

---

## 📐 Relación Polimórfica

`payment_orders` se conecta con `ledger_entries` mediante el **patrón polimórfico**:

```sql
ledger_entries.reference_type = 'payment_order'
ledger_entries.reference_id   = payment_orders.id
```

Esto significa que `ledger_entries` no tiene una FK directa a `payment_orders`. La relación se establece por convención de tipos, igual que como se conecta con `payout_requests` y `bridge_transfers`.

### Tipos de `reference_type` en ledger_entries

| Valor | Tabla origen | Flujo |
|:---|:---|:---|
| `'payment_order'` | `payment_orders` | Depósitos entrantes (pay-in) |
| `'payout_request'` | `payout_requests` | Retiros salientes (payout) |
| `'bridge_transfer'` | `bridge_transfers` | Transferencias Bridge |
| `'liquidation_address'` | `bridge_liquidation_addresses` | Liquidación crypto |
| `'manual_adjustment'` | — | Ajustes manuales de Admin |

---

## 📊 Cuántas Ledger Entries Genera Cada Estado

| Estado de `payment_order` | Entradas en `ledger_entries` | Efecto en `balances` |
|:---|:---|:---|
| `pending` | **0** entradas | Sin cambio |
| `processing` | **0** entradas | Sin cambio |
| `completed` | **1** entrada: `credit settled` (+net_amount) | +net_amount |
| `failed` | **0** entradas | Sin cambio |
| `reversed` | **1** entrada adicional: `reversal` (-net_amount) | -net_amount (devuelve lo acreditado) |
| `swept_external` | **2** entradas: `credit settled` + `debit settled` | $0.00 (neto cero) |

---

## 🧮 Mapeo Detallado: Payment Order → Ledger Entry

### Caso: `completed` (Depósito Interno)

```
payment_orders                    ledger_entries
┌──────────────────────┐         ┌──────────────────────────┐
│ id: ord-xxx          │ ───────→│ reference_id: ord-xxx    │
│ amount: 1000.00      │         │ reference_type: payment_ │
│ fee_amount: 10.00    │         │   order                  │
│ net_amount: 990.00   │ ──amt──→│ amount: 990.00           │
│ currency: USD        │         │ type: credit             │
│ status: completed    │         │ status: settled          │
│ wallet_id: wal-xxx   │ ──fk──→│ wallet_id: wal-xxx       │
└──────────────────────┘         └──────────────────────────┘
                                          │
                                    trigger DB
                                          ▼
                                 ┌──────────────────────────┐
                                 │ balances                  │
                                 │ amount: += 990.00         │
                                 │ available_amount: += 990  │
                                 └──────────────────────────┘
```

### Caso: `swept_external` (Doble Asiento)

```
payment_orders                    ledger_entries (×2)
┌──────────────────────┐         ┌──────────────────────────┐
│ id: ord-yyy          │ ──ref──→│ [1] type: credit         │
│ net_amount: 990.00   │         │     amount: +990.00      │
│ status: swept_ext    │         │     status: settled      │
│                      │         │     description: "Dep    │
│                      │         │       recibido [Sweep]"  │
│                      │         ├──────────────────────────┤
│                      │ ──ref──→│ [2] type: debit          │
│                      │         │     amount: 990.00       │
│                      │         │     status: settled      │
│                      │         │     description: "Auto-  │
│                      │         │       sweep a Binance"   │
└──────────────────────┘         └──────────────────────────┘
                                          │
                                    triggers DB
                                          ▼
                                 ┌──────────────────────────┐
                                 │ balances                  │
                                 │ +990 - 990 = $0.00       │
                                 │ (sin cambio neto)         │
                                 └──────────────────────────┘
```

### Caso: `completed` → `reversed` (Chargeback)

```
Secuencia temporal:
                                          
T1: Depósito acreditado                  
    payment_order → status = 'completed'  
    ledger_entry  → credit +990 settled   
    balance       → +$990                 
                                          
T2: Chargeback (días después)            
    payment_order → status = 'reversed'   
    ledger_entry  → reversal -990 settled 
    balance       → -$990 (vuelta a $0)   
```

---

## ⚡ El Trigger de PostgreSQL

El trigger que actualiza `balances` se ejecuta automáticamente en dos momentos:

### 1. Al INSERT de un ledger_entry con `status = 'settled'`

```sql
-- Pseudo-código del trigger:
CREATE OR REPLACE FUNCTION update_balance_on_settled_ledger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'settled' THEN
        -- Obtener user_id de la wallet
        UPDATE balances SET
            amount = amount + NEW.amount,  -- credit positivo, debit negativo
            available_amount = amount + NEW.amount - reserved_amount,
            updated_at = NOW()
        WHERE user_id = (SELECT user_id FROM wallets WHERE id = NEW.wallet_id)
          AND currency = NEW.currency;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2. Al UPDATE de ledger_entry de `pending` → `settled`

```sql
-- Para payouts: el ledger comienza 'pending' y cambia a 'settled' cuando Bridge confirma
IF OLD.status = 'pending' AND NEW.status = 'settled' THEN
    -- Ahora sí descuenta del balance + libera reserved
    UPDATE balances SET
        amount = amount + NEW.amount,
        reserved_amount = reserved_amount - ABS(NEW.amount),
        available_amount = (amount + NEW.amount) - (reserved_amount - ABS(NEW.amount)),
        updated_at = NOW()
    WHERE ...;
END IF;
```

---

## 📊 Resumen de Flujo de Datos por Caso

| Flujo | payment_order.status | ledger type | ledger status | balance impact |
|:---|:---|:---|:---|:---|
| Depósito Wire interno | `completed` | `credit` | `settled` | +net_amount |
| External Sweep | `swept_external` | `credit` + `debit` | `settled` × 2 | $0.00 |
| Liquidación crypto | (no se crea*) | `credit` | `settled` | +amount |
| Depósito manual | `pending` → `completed` | `credit` | `settled` | +net_amount |
| Chargeback | `completed` → `reversed` | `reversal` | `settled` | -net_amount |

*\* Ver [Caso C](./05_CASO_C_LIQUIDATION_ADDRESS.md) — se recomienda agregar `payment_order` al flujo de liquidación.*

---

## 🔍 Query: Verificar Integridad Payment Order ↔ Ledger

```sql
-- Encontrar payment_orders completadas SIN ledger_entry asociada (posible gap):
SELECT po.*
FROM payment_orders po
LEFT JOIN ledger_entries le 
    ON le.reference_type = 'payment_order' 
    AND le.reference_id = po.id
WHERE po.status = 'completed'
  AND le.id IS NULL;
-- Si esta query retorna filas → hay un problema de integridad
```

```sql
-- Verificar que el net_amount de la order coincide con el ledger:
SELECT 
    po.id,
    po.net_amount AS order_net,
    SUM(CASE WHEN le.type = 'credit' THEN le.amount ELSE 0 END) AS ledger_credits,
    SUM(CASE WHEN le.type = 'debit' THEN le.amount ELSE 0 END) AS ledger_debits
FROM payment_orders po
JOIN ledger_entries le 
    ON le.reference_type = 'payment_order' 
    AND le.reference_id = po.id
GROUP BY po.id, po.net_amount
HAVING po.net_amount != SUM(CASE WHEN le.type = 'credit' THEN le.amount ELSE 0 END);
```
