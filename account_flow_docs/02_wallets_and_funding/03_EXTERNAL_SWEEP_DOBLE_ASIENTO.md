# Depósitos con Destino Externo — External Sweep (Doble Asiento Contable)

> **Descripción:** Cuando un usuario configura su Cuenta Virtual (VA) para enviar fondos a una wallet externa (ej. Binance, MetaMask, Coinbase), Bridge reenvía el dinero directamente hacia esa dirección. Los fondos **nunca entran** al balance interno de Guira. Este documento explica cómo el backend maneja este escenario sin inflar balances ficticios.  
> **Módulo:** `WebhooksService` + `BridgeService`

---

## 🧠 Problema que Resuelve

Si el cliente comparte sus instrucciones bancarias de la Virtual Account y configura como destino una wallet que **no es controlada por Guira** (ej. su cuenta de Binance), Bridge recibe el depósito y lo reenvía automáticamente al address externo. 

**Sin esta solución**, el webhook `virtual_account.funds_received` habría incrementado el balance interno del usuario en Guira, creando un **doble gasto**: el usuario tendría $1,000 en Binance Y $1,000 ficticios en Guira.

---

## 🏗️ Arquitectura: Enfoque de Doble Asiento Contable

Se aplica el patrón financiero de **Net-Zero Accounting**:

```
Credit  (+$990.00) → "Depósito recibido desde VA"
Debit   (-$990.00) → "Auto-sweep a wallet externa: Mi Binance USDC"
─────────────────────────────────────────────────────
Balance neto:  $0.00 (sin cambios en Guira)
```

El usuario verá ambos movimientos en su historial, con total transparencia de que el dinero entró y salió inmediatamente.

---

## 📐 Creación de una VA con Destino Externo

### Endpoint
```
POST /bridge/virtual-accounts
```

### Payload — Destino interno (Guira)
```json
{
  "source_currency": "usd",
  "destination_currency": "usdc",
  "destination_payment_rail": "ethereum",
  "destination_wallet_id": "uuid-de-la-wallet-interna"
}
```

### Payload — Destino externo (Binance, MetaMask, etc.)
```json
{
  "source_currency": "usd",
  "destination_currency": "usdc",
  "destination_payment_rail": "ethereum",
  "destination_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  "destination_label": "Mi Binance USDC"
}
```

### Reglas de Validación
| Regla | Comportamiento |
|:---|:---|
| Solo `destination_wallet_id` | Fondos se quedan en Guira (balance sube) |
| Solo `destination_address` | Fondos van a wallet externa (balance queda en $0, doble asiento) |
| Ambos al mismo tiempo | ❌ Error 400: no se puede especificar los dos |
| Ninguno | Default: se busca la wallet interna activa del usuario |

### Campos nuevos en `bridge_virtual_accounts`
| Columna | Tipo | Descripción |
|:---|:---|:---|
| `is_external_sweep` | `boolean` (default `false`) | `true` si los fondos salen de Guira |
| `external_destination_label` | `text` (nullable) | Etiqueta descriptiva, ej. "Mi Binance USDC" |

---

## 👣 Flujo del Webhook (`virtual_account.funds_received`)

### 1. Recepción y Encolamiento (Igual en ambos casos)
```
POST /webhooks/bridge  →  INSERT webhook_events  →  200 OK
```

### 2. CRON Worker — Despacho
El worker lee el evento, verifica firma HMAC, y llama a `handleFundsReceived`.

### 3. Bifurcación según `is_external_sweep`

```
handleFundsReceived(payload)
   │
   ├─ is_external_sweep === false
   │     └─ handleInternalDeposit()     ← Caso A (balance sube)
   │
   └─ is_external_sweep === true
         └─ handleExternalSweepDeposit() ← Caso B (balance neto $0)
```

---

### Caso A: Depósito Interno (Wallet de Guira)

| Paso | Tabla | Acción |
|:---:|:---|:---|
| 1 | `bridge_virtual_account_events` | Registro del evento Bridge |
| 2 | `payment_orders` | INSERT con `status = 'completed'` |
| 3 | `ledger_entries` | **1 entrada**: `CREDIT settled` por $990 |
| 4 | `balances` | Trigger de DB incrementa `available_amount` en $990 |
| 5 | `notifications` | *"Recibiste $990.00 en tu wallet Guira"* |
| 6 | `activity_logs` | `DEPOSIT_RECEIVED` |

**Balance final:** +$990.00 ✅

---

### Caso B: External Sweep (Wallet externa — Binance, MetaMask)

| Paso | Tabla | Acción |
|:---:|:---|:---|
| 1 | `bridge_virtual_account_events` | Registro del evento Bridge |
| 2 | `payment_orders` | INSERT con `status = 'swept_external'` |
| 3 | `ledger_entries` | **Asiento 1**: `CREDIT settled` +$990 *"Depósito recibido [External Sweep]"* |
| 4 | `ledger_entries` | **Asiento 2**: `DEBIT settled` -$990 *"Auto-sweep a Mi Binance USDC"* |
| 5 | `balances` | Trigger DB: +990 -990 = **$0.00** (sin cambio neto) |
| 6 | `notifications` | *"$990.00 fue reenviado automáticamente a Mi Binance USDC"* |
| 7 | `activity_logs` | `DEPOSIT_EXTERNAL_SWEEP` |

**Balance final:** $0.00 (sin cambio) ✅  
**Historial:** 2 movimientos visibles para el usuario con total transparencia.

---

## 📊 Comparativa Visual de Impacto

```
Escenario A (Interno)                    Escenario B (Externo - External Sweep)
┌─────────────────────────┐              ┌─────────────────────────┐
│ Depósito: $1,000        │              │ Depósito: $1,000        │
│ Fee (1%): -$10          │              │ Fee (1%): -$10          │
│ ────────────────────    │              │ ────────────────────    │
│ Ledger: +$990 (Credit)  │              │ Ledger: +$990 (Credit)  │
│                         │              │ Ledger: -$990 (Debit)   │
│ ════════════════════    │              │ ════════════════════    │
│ Balance Guira: +$990 ✅ │              │ Balance Guira:  $0   ✅ │
│ Wallet Externa: N/A     │              │ Wallet Externa: +$990 ✅│
└─────────────────────────┘              └─────────────────────────┘
```

---

## 🔐 Consideraciones de Seguridad

1. **No hay riesgo de doble gasto**: Los fondos no pueden estar en Guira y en la wallet externa al mismo tiempo.
2. **Auditoría completa**: Ambos asientos de ledger quedan registrados permanentemente, ligados a la misma `payment_order`.
3. **El fee de Guira aplica igual**: Independientemente del destino, Bridge cobra la comisión configurada (`developer_fee_percent`). El usuario recibe el neto en su wallet externa.
4. **Idempotencia**: Si el webhook se repite vía reintentos, el `bridge_event_id` duplicado será rechazado por constraint `UNIQUE`.

---

## 📁 Archivos Modificados

| Archivo | Cambios |
|:---|:---|
| `dto/create-virtual-account.dto.ts` | Nuevos campos `destination_address` y `destination_label` |
| `bridge.service.ts` | Lógica de bifurcación interno/externo al crear VA |
| `webhooks.service.ts` | `handleFundsReceived` bifurca en `handleInternalDeposit` y `handleExternalSweepDeposit` |
| `migrations/add_external_sweep_columns.sql` | Columnas `is_external_sweep` y `external_destination_label` en `bridge_virtual_accounts` |
