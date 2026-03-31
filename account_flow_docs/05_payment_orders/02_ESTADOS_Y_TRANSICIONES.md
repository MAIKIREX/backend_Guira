# 02 — Estados y Transiciones de `payment_orders`

> La tabla `payment_orders` soporta **6 estados** distintos que representan el ciclo de vida completo de un depósito entrante en la plataforma Guira.

---

## 🎨 Los 6 Estados

| # | Estado | Emoji | Descripción | ¿Genera ledger_entry? |
|:---:|:---|:---:|:---|:---:|
| 1 | `pending` | 🟡 | Orden creada pero aún no confirmada por Bridge | ❌ No |
| 2 | `processing` | 🔵 | Bridge está procesando la conversión/transferencia | ❌ No |
| 3 | `completed` | 🟢 | Depósito confirmado y acreditado al cliente | ✅ Sí — `credit settled` |
| 4 | `failed` | 🔴 | El depósito falló o fue rechazado | ❌ No |
| 5 | `reversed` | 🟠 | El depósito fue revertido (chargeback, error bancario) | ✅ Sí — `reversal` entry |
| 6 | `swept_external` | 🔀 | Fondos reenviados automáticamente a wallet externa | ✅ Sí — `credit` + `debit` (neto $0) |

---

## 📐 Diagrama de Máquina de Estados

```
                         ┌─────────────┐
                         │   pending    │ ← Estado por defecto (depósitos manuales/parciales)
                         │     🟡      │
                         └──────┬──────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
            ┌──────────┐ ┌───────────┐ ┌──────────┐
            │processing│ │ completed │ │  failed   │
            │    🔵    │ │    🟢     │ │    🔴    │
            └────┬─────┘ └─────┬─────┘ └──────────┘
                 │             │
                 ▼             ▼
          ┌───────────┐ ┌───────────┐
          │ completed │ │ reversed  │
          │    🟢     │ │    🟠    │
          └───────────┘ └───────────┘


    ┌───────────────────────────────────────────────┐
    │    RUTA ESPECIAL (External Sweep):            │
    │                                               │
    │   webhook recibido ──→ swept_external 🔀      │
    │   (se crea directamente en este estado)       │
    └───────────────────────────────────────────────┘
```

---

## 🔄 Transiciones Válidas

### Transiciones del Flujo Normal (Wire/ACH/SEPA)

| Transición | De → A | Quién la ejecuta | Cuándo ocurre |
|:---:|:---|:---|:---|
| T1 | `pending` → `processing` | Backend (CRON worker) | Bridge notifica que está procesando el depósito |
| T2 | `pending` → `completed` | Backend (webhook handler) | Webhoook `funds_received` confirma fondos (atajo directo) |
| T3 | `processing` → `completed` | Backend (webhook handler) | Bridge confirma conversión y acreditación completa |
| T4 | `pending` → `failed` | Backend / Admin | El depósito fue rechazado por Bridge o el banco |
| T5 | `processing` → `failed` | Backend | La conversión fiat→USDC falló en Bridge |
| T6 | `completed` → `reversed` | Admin (manual) | Chargeback bancario o error de reconciliación |

### Transición Especial (External Sweep)

| Transición | De → A | Quién la ejecuta | Cuándo ocurre |
|:---:|:---|:---|:---|
| T7 | *(nueva)* → `swept_external` | Backend (webhook handler) | Fondos reenviados a wallet externa (Binance, MetaMask) |

---

## 📊 Detalle de Cada Estado

### 🟡 `pending` — Orden Pendiente

**Significado:** La payment order fue creada pero los fondos **aún no han sido confirmados** por la infraestructura bancaria o por Bridge.

**Cuándo se usa:**
- Depósitos manuales creados por Admin que esperan confirmación
- Escenarios futuros donde el depósito requiere revisión de compliance antes de acreditación

**Acciones del sistema:**
- ❌ No genera `ledger_entry`
- ❌ No modifica `balances`
- ⏳ Visible en la UI del usuario como "Depósito en proceso"

**Datos típicos de la orden en este estado:**
```json
{
  "status": "pending",
  "completed_at": null,
  "bridge_event_id": null,
  "notes": "Depósito manual pendiente de verificación"
}
```

---

### 🔵 `processing` — En Procesamiento

**Significado:** Bridge ha recibido el depósito fiat y está realizando la conversión (ej. USD → USDC).

**Cuándo se usa:**
- Estado intermedio para depósitos que requieren conversión de divisa
- Cuando Bridge necesita tiempo para procesar el Wire/ACH entrante

**Acciones del sistema:**
- ❌ No genera `ledger_entry` todavía
- ❌ No modifica `balances`
- ⏳ Puede transicionar a `completed` o `failed`

> **Nota actual:** En la implementación actual del `WebhooksService`, la mayoría de depósitos vía Virtual Account **saltan directamente a `completed`** porque el webhook `virtual_account.funds_received` de Bridge solo se envía cuando los fondos ya fueron recibidos y convertidos. El estado `processing` existe para escenarios futuros o para flujos donde Bridge envíe webhooks intermedios.

---

### 🟢 `completed` — Completado y Acreditado

**Significado:** El depósito fue **exitosamente recibido, confirmado y acreditado** a la wallet del usuario.

**Cuándo se usa:**
- **Caso más común**: El webhook `virtual_account.funds_received` se recibe y procesa sin errores
- Un depósito `pending` que fue aprobado manualmente por Admin

**Acciones del sistema al transicionar a `completed`:**
1. ✅ `INSERT ledger_entries` (type: `credit`, status: `settled`, amount: `net_amount`)
2. ✅ Trigger de DB actualiza `balances.amount` y `balances.available_amount`
3. ✅ `INSERT notifications` ("Depósito Confirmado")
4. ✅ `INSERT activity_logs` (action: `DEPOSIT_RECEIVED`)
5. ✅ `completed_at` se establece con timestamp actual

**Datos típicos:**
```json
{
  "status": "completed",
  "amount": 5050.00,
  "fee_amount": 50.50,
  "net_amount": 4999.50,
  "completed_at": "2026-03-26T15:31:00Z",
  "bridge_event_id": "evt_bridge_abc123",
  "sender_name": "Acme Corp"
}
```

---

### 🔴 `failed` — Fallido

**Significado:** El depósito **no pudo completarse**. El dinero no fue acreditado al usuario.

**Cuándo se usa:**
- Bridge rechazó el depósito (fondos insuficientes del remitente, problemas AML)
- Error de conversión fiat→crypto en Bridge
- Banco rechazó la transferencia Wire/ACH

**Acciones del sistema:**
- ❌ No genera `ledger_entry`
- ❌ No modifica `balances`
- ✅ `INSERT notifications` ("Tu depósito no pudo procesarse")
- ✅ `INSERT activity_logs` (action: `DEPOSIT_FAILED`)

**Datos típicos:**
```json
{
  "status": "failed",
  "completed_at": null,
  "notes": "Bridge rechazó el depósito: sender failed AML screening"
}
```

---

### 🟠 `reversed` — Revertido

**Significado:** Un depósito que **ya fue acreditado** (`completed`) fue posteriormente **devuelto o revertido**.

**Cuándo se usa:**
- **Chargeback bancario:** El banco del remitente revierte la transferencia
- **Error de reconciliación:** Se detecta que el depósito fue duplicado o erróneo
- **Compliance:** El equipo de Compliance ordena reversar una transacción sospechosa

**Acciones del sistema al transicionar `completed → reversed`:**
1. ✅ `INSERT ledger_entries` (type: `reversal`, amount: **negativo** por el `net_amount`)
2. ✅ Trigger de DB **decrementa** `balances.amount` y `balances.available_amount`
3. ✅ `INSERT notifications` ("Tu depósito fue revertido")
4. ✅ `INSERT audit_logs` (el Admin que autorizó la reversión)
5. ✅ `notes` se actualiza con la razón de la reversión

**Datos típicos:**
```json
{
  "status": "reversed",
  "completed_at": "2026-03-26T15:31:00Z",
  "notes": "Chargeback bancario — caso REF-2026-0041. Autorizado por admin@guira.com"
}
```

> ⚠️ **Importante:** Una reversión solo puede ocurrir **después** de que la orden estuvo en `completed`. Genera un ledger_entry negativo que descuenta el balance del usuario.

---

### 🔀 `swept_external` — Reenviado a Wallet Externa

**Significado:** El depósito fue recibido por Bridge pero los fondos fueron **automáticamente reenviados a una wallet externa** (Binance, MetaMask, Coinbase, etc.) porque la Virtual Account tiene `is_external_sweep = true`.

**Cuándo se usa:**
- El usuario configuró su Virtual Account con un `destination_address` externo
- Bridge recibió los fondos y los envió al address configurado

**Acciones del sistema (Doble Asiento Contable):**
1. ✅ `INSERT ledger_entries` — **Asiento 1: CRÉDITO** (+net_amount, settled)
2. ✅ `INSERT ledger_entries` — **Asiento 2: DÉBITO** (-net_amount, settled)
3. ✅ Triggers de DB: **+netAmount -netAmount = $0.00** (balance sin cambio neto)
4. ✅ `INSERT notifications` ("$990.00 fue reenviado a Mi Binance USDC")
5. ✅ `INSERT activity_logs` (action: `DEPOSIT_EXTERNAL_SWEEP`)

**Datos típicos:**
```json
{
  "status": "swept_external",
  "amount": 1000.00,
  "fee_amount": 10.00,
  "net_amount": 990.00,
  "completed_at": null,
  "bridge_event_id": "evt_bridge_sweep_456",
  "sender_name": "Proveedor ABC"
}
```

**¿Por qué existe este estado?** Para diferenciar en reportes y auditoría los depósitos que realmente incrementaron el balance de Guira (`completed`) de los que solo transitaron por la plataforma (`swept_external`).

---

## 📊 Distribución Esperada por Estado

En operación normal, la distribución típica sería:

| Estado | Porcentaje esperado | Notas |
|:---|:---:|:---|
| `completed` | ~80-90% | La mayoría de depósitos fluyen con éxito |
| `swept_external` | ~5-15% | Usuarios con destino externo configurado |
| `pending` | ~1-3% | Depósitos manuales o en cola |
| `processing` | ~0-1% | Estado transitorio, rara vez visible |
| `failed` | ~1-3% | Depósitos rechazados por banco o AML |
| `reversed` | <1% | Chargebacks o correcciones raras |

---

## 🔍 Queries Útiles por Estado

### Ver órdenes completadas de un usuario
```sql
SELECT * FROM payment_orders
WHERE user_id = :user_id
  AND status = 'completed'
ORDER BY completed_at DESC;
```

### Ver órdenes que necesitan atención (Admin)
```sql
SELECT * FROM payment_orders
WHERE status IN ('pending', 'failed')
ORDER BY created_at ASC;
```

### Dashboard de volumen por estado
```sql
SELECT status, COUNT(*), SUM(amount) as total_bruto, SUM(net_amount) as total_neto
FROM payment_orders
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY COUNT(*) DESC;
```

### Detectar external sweeps recientes
```sql
SELECT po.*, bva.destination_address, bva.external_destination_label
FROM payment_orders po
JOIN bridge_virtual_accounts bva ON po.source_reference_id = bva.id::text
WHERE po.status = 'swept_external'
  AND po.created_at >= NOW() - INTERVAL '7 days'
ORDER BY po.created_at DESC;
```
