# Visión General del Flujo de Transacciones

> **Descripción:** Este documento explica de principio a fin el ciclo de vida completo de una transacción/transfer en Guira, desde que el usuario presiona "Enviar Dinero" hasta que el destinatario recibe los fondos en su banco.

---

## 🗺️ Diagrama Macro del Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUJO COMPLETO DE UNA TRANSACCIÓN                      │
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐      │
│  │ USUARIO  │───>│  GUIRA   │───>│  BRIDGE  │───>│ BANCO DESTINO   │      │
│  │ (App)    │    │ (Backend)│    │  (API)   │    │ (Cuenta Externa) │      │
│  └──────────┘    └────┬─────┘    └─────┬────┘    └──────────────────┘      │
│       │               │               │                                     │
│  1.Solicita        2.Valida y      3.Ejecuta el       4.Deposita en        │
│    payout           reserva          transfer            la cuenta          │
│                     saldo                                destino            │
│                        │               │                    │               │
│                   5.Registra      6.Procesa          7.Confirma vía        │
│                     ledger          pago                webhook             │
│                     pendiente                                               │
│                        │                                    │               │
│                   8.Webhook confirma ◄──────────────────────┘               │
│                     y liquida el                                            │
│                     asiento contable                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 👣 Pasos Detallados del Flujo

### 📌 PASO 1 — El Usuario Solicita un Payout

El usuario desde la app selecciona:
- Su **wallet de origen** (ej. wallet USD).
- La **cuenta bancaria destino** (External Account previamente registrada).
- El **monto** a enviar.
- El **payment rail** (ACH, Wire, SEPA, SPEI).

**Endpoint Guira:**
```
POST /bridge/payouts
```

```json
{
  "wallet_id": "uuid-wallet-origen",
  "bridge_external_account_id": "uuid-cuenta-externa-guira",
  "amount": 500.00,
  "currency": "usd",
  "payment_rail": "ach",
  "business_purpose": "Pago a proveedor de inventario AWS",
  "notes": "Factura #INV-2993"
}
```

---

### 📌 PASO 2 — Guira Valida y Reserva el Saldo

El método `createPayout` del backend ejecuta los siguientes controles en orden estricto:

| # | Control | Descripción | Fallo |
|:---:|:---|:---|:---|
| 1 | **Calcular Fee** | El `FeeService` calcula la comisión (ej. ACH = $2 USD). Total a apartar: `$502 USD`. | — |
| 2 | **Validar Saldo** | Verifica que `available_amount >= $502`. | `400: Saldo insuficiente` |
| 3 | **Validar Límites** | Consulta `transaction_limits` según KYC/KYB del usuario. | `400: Límite de transferencia excedido` |
| 4 | **Reservar Saldo** | Llama al Stored Procedure `.rpc('reserve_balance')` para mover $502 de `available_amount` → `reserved_amount` atómicamente. | `500: Error en reserva` |
| 5 | **Crear Payout Request** | Inserta registro en `payout_requests` con `status = 'pending'`. | — |

```
┌──────────────────────────────── WALLET ─────────────────────────────────┐
│                                                                          │
│  ANTES:  available_amount = $1,000.00  │  reserved_amount = $0.00       │
│  ─────────────────────────────────────────────────────────────────────── │
│  DESPUÉS: available_amount = $498.00   │  reserved_amount = $502.00     │
│                                          ($500 + $2 fee)                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### 📌 PASO 3 — Decisión: Auto-Aprobación vs. Revisión Manual

Inmediatamente después de la reserva, Guira evalúa si el monto supera el umbral configurable `PAYOUT_REVIEW_THRESHOLD`:

```
                     ┌──────────────────────┐
                     │   ¿Monto > THRESHOLD │
                     │    de revisión?       │
                     └───────┬──────┬───────┘
                             │      │
                    NO ◄─────┘      └─────► SÍ
                    │                       │
          ┌─────────▼────────┐    ┌────────▼──────────────┐
          │  OPCIÓN A:       │    │  OPCIÓN B:             │
          │  Auto-aprobado   │    │  Requiere Revisión     │
          │  Se ejecuta      │    │  Se crea               │
          │  inmediatamente  │    │  compliance_reviews    │
          │  en Bridge API   │    │  status = 'pending'    │
          └──────────────────┘    └────────────────────────┘
```

#### OPCIÓN A: Auto-aprobado (monto bajo)
Guira llama inmediatamente a `BridgeService.executePayout()` que crea un Transfer en Bridge API.

**Respuesta al usuario:**
```json
{
  "payout_request_id": "uuid-de-la-solicitud-de-pago",
  "bridge_transfer_id": "tf_123456789",
  "status": "processing"
}
```

#### OPCIÓN B: Requiere revisión (monto alto)
Se genera un registro en `compliance_reviews` y queda en espera.

**Respuesta al usuario:**
```json
{
  "id": "uuid-de-la-solicitud-de-pago",
  "amount": 500,
  "fee_amount": 2,
  "status": "pending",
  "requires_review": true
}
```

**Aprobación Admin:** `POST /admin/bridge/payouts/{id}/approve`
**Rechazo Admin:** `POST /admin/bridge/payouts/{id}/reject`

---

### 📌 PASO 4 — Guira Crea el Transfer en Bridge API

Cuando el payout es aprobado (automática o manualmente), Guira ejecuta la llamada **server-to-server** a Bridge:

**Endpoint Bridge (Llamada Interna):**
```
POST https://api.bridge.xyz/v0/transfers
```

**Headers:**
```
Api-Key: <bridge-api-key>
Content-Type: application/json
Idempotency-Key: <uuid-idempotencia>
```

**Body enviado a Bridge:**
```json
{
  "on_behalf_of": "cust_123456789",
  "amount": "500.00",
  "developer_fee": "2.00",
  "source": {
    "payment_rail": "ethereum",
    "currency": "usdc",
    "from_address": "0x...(wallet controlada por Guira/Bridge)"
  },
  "destination": {
    "payment_rail": "ach",
    "currency": "usd",
    "external_account_id": "ea_987654321"
  },
  "client_reference_id": "payout_uuid-de-la-solicitud-de-pago"
}
```

**Respuesta de Bridge (201 Created):**
```json
{
  "id": "tf_abc123-transfer-uuid",
  "client_reference_id": "payout_uuid-de-la-solicitud-de-pago",
  "state": "awaiting_funds",
  "on_behalf_of": "cust_123456789",
  "amount": "500.00",
  "currency": "usd",
  "developer_fee": "2.00",
  "source": {
    "payment_rail": "ethereum",
    "currency": "usdc"
  },
  "destination": {
    "payment_rail": "ach",
    "currency": "usd",
    "external_account_id": "ea_987654321"
  },
  "receipt": {
    "initial_amount": "500.00",
    "developer_fee": "2.00",
    "exchange_fee": "0.00",
    "subtotal_amount": "498.00",
    "gas_fee": "0.10",
    "final_amount": "497.90",
    "url": "https://dashboard.bridge.xyz/transaction/.../receipt/..."
  },
  "created_at": "2026-03-31T10:00:00.000Z",
  "updated_at": "2026-03-31T10:00:00.000Z"
}
```

---

### 📌 PASO 5 — Guira Registra el Asiento Contable Pendiente

Al recibir la confirmación de creación del transfer, Guira:

1. **Guarda en `bridge_transfers`:** Almacena el `bridge_transfer_id`, el `state`, el `source` y `destination` para tracking.
2. **Genera un Ledger Entry (Débito Pendiente):** Inserta un asiento de tipo `DEBIT` en `ledger_entries` con status `pending`.

```
┌─── ledger_entries ──────────────────────────────────────────┐
│ type: DEBIT                                                  │
│ amount: $502.00                                              │
│ status: pending                                              │
│ wallet_id: uuid-wallet-origen                                │
│ bridge_transfer_id: tf_abc123-transfer-uuid                  │
│ description: "Payout ACH - Factura #INV-2993"               │
└──────────────────────────────────────────────────────────────┘
```

> **IMPORTANTE:** En este punto el balance NO se ha restado definitivamente. El monto sigue en `reserved_amount` como apartado.

---

### 📌 PASO 6 — Bridge Procesa el Pago

Bridge internamente realiza:
1. Convierte los fondos (si aplica: USDC → USD).
2. Envía el pago al banco destino usando el carril seleccionado (ACH, Wire, etc.).
3. Va actualizando el estado del transfer progresivamente.

```
awaiting_funds → funds_received → payment_submitted → payment_processed
```

---

### 📌 PASO 7 — Webhooks de Bridge Confirman el Progreso

Bridge notifica a Guira vía webhooks en cada cambio de estado:

#### Webhook: `transfer.payment_processed`
```json
{
  "event_type": "transfer.payment_processed",
  "id": "evt_789",
  "data": {
    "id": "tf_abc123-transfer-uuid",
    "state": "payment_processed",
    "amount": "500.00",
    "receipt": { "..." }
  }
}
```
**Acción Guira:** Actualiza `bridge_transfers.status → 'payment_processed'`.

---

### 📌 PASO 8 — Liquidación Final

#### Webhook: `transfer.payment_processed` (Estado Final exitoso)
Cuando Bridge confirma que los fondos fueron entregados al banco destino:

1. **Ledger Entry:** `status` cambia de `pending` → `settled`.
2. **Trigger de PostgreSQL:** Al detectar que el ledger pasó a `settled`, el trigger automáticamente resta el monto de `reserved_amount` dejándolo en `$0`.
3. **Payout Request:** Se actualiza a `completed`.
4. **Certificado Transaccional:** Se genera un registro en `certificates` con número secuencial (ej. `CERT-2026-XyZ`).
5. **Notificación:** Push notification al usuario: *"Tu pago de $500.00 USD ha sido completado"*.

```
┌──────────────────────────────── WALLET ─────────────────────────────────┐
│                                                                          │
│  ANTES:  available_amount = $498.00   │  reserved_amount = $502.00      │
│  ─────────────────────────────────────────────────────────────────────── │
│  DESPUÉS: available_amount = $498.00  │  reserved_amount = $0.00        │
│           (no cambia: ya estaba         ($502 liquidados)                │
│            ajustado desde el paso 2)                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ⏱️ Timeline Típico

| Tiempo | Evento | Estado Bridge | Estado Guira |
|:---|:---|:---|:---|
| T+0s | Usuario solicita payout | — | `pending` |
| T+1s | Guira reserva saldo y crea transfer | `awaiting_funds` | `processing` |
| T+5s | Bridge recibe fondos internamente | `funds_received` | `processing` |
| T+30s | Bridge envía pago al banco | `payment_submitted` | `processing` |
| T+1-3 días (ACH) | Banco destino confirma | `payment_processed` | `completed` |

> **Nota:** Los tiempos de liquidación dependen del payment rail:
> - **ACH:** 1-3 días hábiles
> - **Wire:** Mismo día (si se envía antes del cutoff)
> - **SEPA:** 1-2 días hábiles
> - **SPEI:** Minutos (en horario bancario MX)
