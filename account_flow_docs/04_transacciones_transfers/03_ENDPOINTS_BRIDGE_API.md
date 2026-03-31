# Endpoints Bridge API — Llamadas Server-to-Server

> **Descripción:** Endpoints de la API de Bridge que Guira llama internamente (desde el backend) para orquestar las transferencias de dinero. Estos endpoints **NUNCA** son expuestos al frontend.
> **Base URL Bridge:** `https://api.bridge.xyz/v0`
> **Autenticación:** Header `Api-Key: <bridge-api-key>`
> **Documentación Oficial:** [https://apidocs.bridge.xyz/api-reference/transfers](https://apidocs.bridge.xyz/api-reference/transfers/get-all-transfers)

---

## 📋 Resumen de Endpoints de Bridge

| Método | Endpoint Bridge | Corresponde en Guira a: |
|:---:|:---|:---|
| `POST` | `/v0/transfers` | Cuando Guira ejecuta un payout aprobado. |
| `GET` | `/v0/transfers` | Consulta masiva de transfers (reconciliación). |
| `GET` | `/v0/transfers/{transferID}` | Consulta puntual del estado de un transfer. |
| `PUT` | `/v0/transfers/{transferID}` | Actualizar monto o fee antes de que Bridge procese. |
| `DELETE` | `/v0/transfers/{transferID}` | Cancelar un transfer en estado `awaiting_funds`. |

---

## 1️⃣ Crear un Transfer (POST)

> **¿Cuándo se llama?** Cuando `BridgeService.executePayout()` es invocado tras la aprobación de un payout.

```
POST https://api.bridge.xyz/v0/transfers
```

### Headers Requeridos

```http
Api-Key: sk_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440099
```

> [!IMPORTANT]
> El `Idempotency-Key` es **obligatorio** para prevenir la creación duplicada de transfers en caso de reintentos por timeout. Guira genera un UUID único por cada payout request.

### 📥 Body — Payout Fiat a Cuenta Bancaria (Offramp: USDC → USD vía ACH)

```json
{
  "on_behalf_of": "cust_123456789",
  "amount": "500.00",
  "developer_fee": "2.00",
  "source": {
    "payment_rail": "ethereum",
    "currency": "usdc",
    "from_address": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
  },
  "destination": {
    "payment_rail": "ach",
    "currency": "usd",
    "external_account_id": "ea_987654321"
  },
  "client_reference_id": "payout_770e8400-e29b-41d4-a716-446655440002"
}
```

### Descripción de Campos del Request

| Campo | Tipo | Requerido | Descripción |
|:---|:---:|:---:|:---|
| `on_behalf_of` | `string` | ✅ | El `bridge_customer_id` del usuario de Guira. Bridge necesita saber en nombre de quién se mueve el dinero. |
| `amount` | `string` | ✅ | Monto de la transferencia como string decimal (ej. `"500.00"`). Denominado en la moneda source si es fiat. |
| `developer_fee` | `string` | ❌ | Fee fijo que Guira cobra como comisión. Se descuenta de lo que el beneficiario recibe. |
| `developer_fee_percent` | `string` | ❌ | Alternativa a `developer_fee`: porcentaje (ej. `"1.0"` = 1%). No combinar con `developer_fee`. |
| `source.payment_rail` | `string` | ✅ | Carril de origen: `ethereum`, `polygon`, `solana`, `stellar`, `ach`, `wire`, etc. |
| `source.currency` | `string` | ✅ | Moneda de origen: `usdc`, `usdt`, `usd`, `eur`, etc. |
| `source.from_address` | `string` | ❌ | Dirección crypto de origen (si aplica). |
| `source.bridge_wallet_id` | `string` | ❌ | ID de una wallet administrada por Bridge. |
| `destination.payment_rail` | `string` | ✅ | Carril destino: `ach`, `wire`, `sepa`, `spei`, `ethereum`, etc. |
| `destination.currency` | `string` | ✅ | Moneda destino: `usd`, `eur`, `mxn`, `usdc`, etc. |
| `destination.external_account_id` | `string` | ❌* | ID de la cuenta externa registrada en Bridge (para payouts fiat). |
| `destination.to_address` | `string` | ❌* | Dirección crypto destino (para transfers crypto-to-crypto). |
| `destination.wire_message` | `string` | ❌ | Mensaje para transferencias Wire. |
| `destination.sepa_reference` | `string` | ❌ | Referencia SEPA para pagos europeos. |
| `destination.spei_reference` | `string` | ❌ | Referencia SPEI para pagos en México. |
| `destination.ach_reference` | `string` | ❌ | Referencia ACH. |
| `client_reference_id` | `string` | ❌ | ID de referencia de Guira para vincular el transfer con el `payout_request` interno. Max 256 chars. |
| `dry_run` | `boolean` | ❌ | Si es `true`, valida la ruta sin crear el transfer (útil para testing). |

> **Nota:** En `destination`, se usa `external_account_id` para payouts fiat o `to_address` para transfers crypto. Solo uno puede especificarse.

### 📤 Respuesta de Bridge (201 Created)

```json
{
  "id": "tf_abc123-uuid-del-transfer",
  "client_reference_id": "payout_770e8400-e29b-41d4-a716-446655440002",
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
    "url": "https://dashboard.bridge.xyz/transaction/xxx/receipt/yyy"
  },
  "source_deposit_instructions": {
    "payment_rail": "ethereum",
    "amount": "500.00",
    "currency": "usdc",
    "to_address": "0xBRIDGE_DEPOSIT_ADDRESS..."
  },
  "created_at": "2026-03-31T10:00:00.000Z",
  "updated_at": "2026-03-31T10:00:00.000Z"
}
```

### Descripción de Campos de la Respuesta

| Campo de Respuesta | Descripción |
|:---|:---|
| `id` | UUID único del transfer en Bridge. **Guira almacena esto como `bridge_transfer_id`.** |
| `state` | Estado actual del transfer. Ver doc `04_ESTADOS_TRANSFER.md`. |
| `receipt.initial_amount` | Monto bruto original. |
| `receipt.developer_fee` | Comisión de Guira que Bridge apartó. |
| `receipt.exchange_fee` | Fee de cambio de moneda de Bridge (si aplica conversión). |
| `receipt.gas_fee` | Fee de gas blockchain (si la source o destination es crypto). |
| `receipt.final_amount` | Monto final que recibirá el beneficiario tras todos los descuentos. |
| `receipt.url` | URL pública al recibo de la transacción en el dashboard de Bridge. |
| `source_deposit_instructions` | Instrucciones de depósito si Bridge necesita que se envíen fondos primero. |
| `client_reference_id` | La misma referencia que Guira envió al crear el transfer. |

---

### 📥 Body — Variantes por Payment Rail

#### Payout Vía Wire (USD)
```json
{
  "on_behalf_of": "cust_123456789",
  "amount": "10000.00",
  "developer_fee": "25.00",
  "source": {
    "payment_rail": "ethereum",
    "currency": "usdc"
  },
  "destination": {
    "payment_rail": "wire",
    "currency": "usd",
    "external_account_id": "ea_wire_account_id",
    "wire_message": "INV-2993 Payment"
  },
  "client_reference_id": "payout_uuid"
}
```

#### Payout Vía SEPA (EUR)
```json
{
  "on_behalf_of": "cust_123456789",
  "amount": "1500.00",
  "developer_fee_percent": "1.0",
  "source": {
    "payment_rail": "ethereum",
    "currency": "usdc"
  },
  "destination": {
    "payment_rail": "sepa",
    "currency": "eur",
    "external_account_id": "ea_sepa_account_id",
    "sepa_reference": "GUIRA-PAY-2993"
  },
  "client_reference_id": "payout_uuid"
}
```

#### Payout Vía SPEI (MXN)
```json
{
  "on_behalf_of": "cust_123456789",
  "amount": "25000.00",
  "developer_fee": "50.00",
  "source": {
    "payment_rail": "ethereum",
    "currency": "usdc"
  },
  "destination": {
    "payment_rail": "spei",
    "currency": "mxn",
    "external_account_id": "ea_spei_account_id",
    "spei_reference": "FACTURA-INV2993"
  },
  "client_reference_id": "payout_uuid"
}
```

---

## 2️⃣ Obtener Todos los Transfers (GET)

> **¿Cuándo se llama?** Para procesos de reconciliación batch, o para sincronizar estados con la BD de Guira.

```
GET https://api.bridge.xyz/v0/transfers
```

### Headers
```http
Api-Key: sk_live_xxxxxxxxxxxxxxxxxxxx
```

### Query Parameters

| Parámetro | Tipo | Descripción |
|:---|:---:|:---|
| `limit` | `number` | Número de registros a devolver (default: 10, max: 100). |
| `starting_after` | `UUID` | Paginación: devuelve transfers **después** de este ID (más antiguos). |
| `ending_before` | `UUID` | Paginación: devuelve transfers **antes** de este ID (más nuevos). |
| `state` | `string` | Filtrar por estado: `awaiting_funds`, `funds_received`, `payment_submitted`, `payment_processed`, `canceled`, `error`, `returned`, `refunded`. |
| `tx_hash` | `string` | Buscar por hash de transacción blockchain. |
| `updated_after_ms` | `number` | Unix timestamp en ms. Devuelve transfers actualizados **después** de esta fecha. |
| `updated_before_ms` | `number` | Unix timestamp en ms. Devuelve transfers actualizados **antes** de esta fecha. |
| `template_id` | `UUID` | Filtrar por ID de template estático. |

### 📤 Respuesta (200 OK)

```json
{
  "count": 2,
  "data": [
    {
      "id": "tf_abc123",
      "state": "payment_processed",
      "amount": "500.00",
      "currency": "usd",
      "on_behalf_of": "cust_123456789",
      "source": { "payment_rail": "ethereum", "currency": "usdc" },
      "destination": { "payment_rail": "ach", "currency": "usd" },
      "created_at": "2026-03-31T10:00:00Z",
      "updated_at": "2026-04-02T14:30:00Z"
    },
    {
      "id": "tf_def456",
      "state": "awaiting_funds",
      "amount": "1500.00",
      "currency": "eur",
      "on_behalf_of": "cust_987654321",
      "source": { "payment_rail": "polygon", "currency": "usdc" },
      "destination": { "payment_rail": "sepa", "currency": "eur" },
      "created_at": "2026-03-31T12:00:00Z",
      "updated_at": "2026-03-31T12:00:00Z"
    }
  ]
}
```

---

## 3️⃣ Obtener un Transfer Individual (GET)

> **¿Cuándo se llama?** Para consultar el estado actualizado de un transfer específico (polling manual o reconciliación).

```
GET https://api.bridge.xyz/v0/transfers/{transferID}
```

### Path Parameters

| Parámetro | Tipo | Descripción |
|:---|:---:|:---|
| `transferID` | `UUID` | ID del transfer en Bridge (ej. `tf_abc123`). |

### 📤 Respuesta (200 OK)

Devuelve el mismo objeto Transfer completo que en la respuesta de creación (sección 1️⃣), pero con el `state` actualizado al momento presente.

---

## 4️⃣ Actualizar un Transfer (PUT)

> **¿Cuándo se llama?** Solo si un transfer está en estado `awaiting_funds` y Guira necesita cambiar el monto o fee antes de que Bridge comience a procesarlo.

```
PUT https://api.bridge.xyz/v0/transfers/{transferID}
```

### 📥 Body Request

```json
{
  "amount": "550.00",
  "developer_fee": "3.00"
}
```

| Campo | Tipo | Descripción |
|:---|:---:|:---|
| `amount` | `string` | Nuevo monto de la transferencia. |
| `developer_fee` | `string` | Nueva comisión fija. |
| `developer_fee_percent` | `string` | Nueva comisión en porcentaje (alternativa). |
| `return_instructions.address` | `string` | Dirección de retorno en caso de devolución. |
| `return_instructions.memo` | `string` | Memo de retorno (requerido para Stellar). |

### 📤 Respuesta (201 Updated)

Devuelve el objeto Transfer actualizado con los nuevos valores.

> ⚠️ **Solo se puede actualizar un transfer en estado `awaiting_funds`.** Si ya pasó a `funds_received` o más adelante, esta operación retornará error.

---

## 5️⃣ Eliminar / Cancelar un Transfer (DELETE)

> **¿Cuándo se llama?** Si Guira necesita cancelar un transfer que aún no ha sido fondeado (estado `awaiting_funds`).

```
DELETE https://api.bridge.xyz/v0/transfers/{transferID}
```

### 📤 Respuesta (200 OK)

El transfer cambia a estado `canceled`. Guira entonces debe ejecutar la lógica de liberación de saldo reservado.

> ⚠️ **Solo se puede cancelar un transfer en estado `awaiting_funds`.** Una vez que Bridge ha recibido fondos, la cancelación ya no es posible.

---

## 🔑 Monedas y Payment Rails Soportados

### Monedas (`currency`)

| Código | Nombre | Tipo |
|:---:|:---|:---:|
| `usd` | Dólar estadounidense | Fiat |
| `eur` | Euro | Fiat |
| `mxn` | Peso mexicano | Fiat |
| `brl` | Real brasileño | Fiat |
| `cop` | Peso colombiano | Fiat |
| `gbp` | Libra esterlina | Fiat |
| `usdc` | USD Coin | Crypto |
| `usdt` | Tether | Crypto |

### Payment Rails

| Rail | Descripción | Velocidad Típica |
|:---|:---|:---|
| `ach` | ACH (EE.UU.) | 1-3 días hábiles |
| `wire` | Wire Transfer (EE.UU.) | Mismo día |
| `sepa` | SEPA (Europa) | 1-2 días hábiles |
| `spei` | SPEI (México) | Minutos |
| `ethereum` | Red Ethereum | ~15 segundos |
| `polygon` | Red Polygon | ~2 segundos |
| `solana` | Red Solana | ~1 segundo |
| `stellar` | Red Stellar | ~5 segundos |
