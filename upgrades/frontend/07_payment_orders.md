# 07 — Payment Orders (Órdenes de Pago — 11 Flujos Financieros)

> **Prefijo Usuario:** `/payment-orders`  
> **Prefijo Admin:** `/admin/payment-orders`

---

## Máquina de Estados

```
┌────────────────────────────────────────────────────────────┐
│  FLUJOS CON PSAV (requieren depósito manual del usuario)   │
│                                                            │
│  waiting_deposit → deposit_received → processing → sent    │
│       │                │                  │          │      │
│       ↓                ↓                  ↓          ↓      │
│   cancelled          failed            failed     completed │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  FLUJOS AUTOMÁTICOS (Bridge directo)                        │
│                                                            │
│  created → processing → completed                          │
│     │          │                                            │
│     ↓          ↓                                            │
│   failed     failed (vía webhook)                          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  FLUJOS DE DEPÓSITO ENTRANTE (espera depósito Bridge)       │
│                                                            │
│  waiting_deposit → processing → completed (vía webhook)    │
│       │                                                    │
│       ↓                                                    │
│   cancelled                                                │
└────────────────────────────────────────────────────────────┘
```

### Estados

| Estado | Significado | Quién lo ve | Color sugerido |
|--------|------------|-------------|----------------|
| `created` | Orden creada, procesando automáticamente | Cliente + Admin | 🔵 Azul |
| `waiting_deposit` | Esperando que el usuario deposite | Cliente | 🟡 Amarillo |
| `deposit_received` | Comprobante subido, esperando aprobación admin | Admin | 🟠 Naranja |
| `processing` | Admin aprobó o Bridge está procesando | Ambos | 🔵 Azul |
| `sent` | Admin ejecutó el pago, en tránsito | Ambos | 🟣 Púrpura |
| `completed` | Pago entregado exitosamente | Ambos | 🟢 Verde |
| `failed` | Error en cualquier punto | Ambos | 🔴 Rojo |
| `cancelled` | Cancelada por el usuario | Ambos | ⚫ Gris |

---

## 11 Flujos Financieros — Clasificación

### Categoría: `interbank` (5 flujos)

| # | flow_type | Descripción | Requiere PSAV | Estado inicial |
|---|-----------|-------------|---------------|----------------|
| 1 | `bolivia_to_world` | Bolivia → Banco exterior | ✅ | `waiting_deposit` |
| 2 | `wallet_to_wallet` | Wallet crypto → Wallet crypto | ❌ | `created` |
| 3 | `bolivia_to_wallet` | Bolivia → Wallet crypto externa | ✅ | `waiting_deposit` |
| 4 | `world_to_bolivia` | Banco exterior → Bolivia | ✅ | `waiting_deposit` |
| 5 | `world_to_wallet` | Banco exterior → Wallet Bridge | ❌ | `waiting_deposit` |

### Categoría: `wallet_ramp` (6 flujos)

| # | flow_type | Descripción | Requiere PSAV | Estado inicial |
|---|-----------|-------------|---------------|----------------|
| 6 | `fiat_bo_to_bridge_wallet` | Fiat(BOB) → Wallet Bridge | ✅ | `waiting_deposit` |
| 7 | `crypto_to_bridge_wallet` | Crypto → Wallet Bridge | ❌ | `waiting_deposit` |
| 8 | `fiat_us_to_bridge_wallet` | Fiat(USD) → Wallet Bridge | ❌ | `waiting_deposit` |
| 9 | `bridge_wallet_to_fiat_bo` | Wallet Bridge → Fiat(BOB) | ✅ | `waiting_deposit` |
| 10 | `bridge_wallet_to_crypto` | Wallet Bridge → Crypto | ❌ | `created` |
| 11 | `bridge_wallet_to_fiat_us` | Wallet Bridge → Fiat(USD) | ❌ | `created` |

---

## Endpoints de Usuario

### `POST /payment-orders/interbank` — Crear orden interbancaria

**Request Body — `bolivia_to_world`:**
```json
{
  "flow_type": "bolivia_to_world",
  "amount": 1000.00,
  "external_account_id": "uuid-cuenta-destino",
  "destination_currency": "usd",
  "business_purpose": "Pago a proveedor — Factura #2026-001",
  "supporting_document_url": "https://storage.../factura.pdf",
  "notes": "Urgente"
}
```

**Request Body — `wallet_to_wallet`:**
```json
{
  "flow_type": "wallet_to_wallet",
  "amount": 500.00,
  "source_address": "0xABC...",
  "source_network": "ethereum",
  "source_currency": "usdt",
  "destination_address": "0xDEF...",
  "destination_network": "polygon",
  "business_purpose": "Transferencia entre wallets"
}
```

**Request Body — `bolivia_to_wallet`:**
```json
{
  "flow_type": "bolivia_to_wallet",
  "amount": 2000.00,
  "destination_address": "0xGHI...",
  "destination_network": "ethereum",
  "business_purpose": "Compra de crypto"
}
```

**Request Body — `world_to_bolivia`:**
```json
{
  "flow_type": "world_to_bolivia",
  "amount": 3000.00,
  "destination_currency": "bob",
  "destination_bank_name": "Banco Nacional de Bolivia",
  "destination_account_number": "1234567890",
  "destination_account_holder": "Juan Pérez",
  "destination_qr_url": "https://...",
  "business_purpose": "Repatriación de fondos"
}
```

**Request Body — `world_to_wallet`:**
```json
{
  "flow_type": "world_to_wallet",
  "amount": 1500.00,
  "virtual_account_id": "uuid-de-la-VA",
  "business_purpose": "Fondeo desde exterior"
}
```

**Response 201 (todos los flujos):**
```json
{
  "id": "uuid",
  "status": "waiting_deposit",
  "flow_type": "bolivia_to_world",
  "flow_category": "interbank",
  "amount": 1000.00,
  "source_currency": "bob",
  "destination_currency": "usd",
  "fee_amount": 20.00,
  "net_amount": 980.00,
  "exchange_rate_applied": 6.90,
  "amount_destination": 142.03,
  "requires_psav": true,
  "psav_deposit_instructions": {
    "bank_name": "Banco Nacional de Bolivia",
    "account_number": "0000000000",
    "account_holder": "PSAV Intermediario",
    "qr_url": "https://..."
  },
  "destination_bank_name": null,
  "destination_account_number": null,
  "bridge_source_deposit_instructions": null,
  "created_at": "..."
}
```

**Datos a mostrar según estado:**
- `waiting_deposit` → Instrucciones de depósito PSAV + botón "Confirmar depósito"
- `created` → Spinner "Procesando automáticamente"
- Badge de estado con color correspondiente

---

### `POST /payment-orders/wallet-ramp` — Crear orden de rampa

**Request Body — `fiat_bo_to_bridge_wallet` (On-ramp BOB):**
```json
{
  "flow_type": "fiat_bo_to_bridge_wallet",
  "amount": 500.00,
  "wallet_id": "uuid-wallet-bridge",
  "business_purpose": "Fondeo wallet"
}
```

**Request Body — `crypto_to_bridge_wallet` (On-ramp Crypto):**
```json
{
  "flow_type": "crypto_to_bridge_wallet",
  "amount": 200.00,
  "wallet_id": "uuid-wallet-bridge",
  "source_network": "ethereum",
  "source_address": "0xMySenderAddress..."
}
```

**Request Body — `fiat_us_to_bridge_wallet` (On-ramp USD):**
```json
{
  "flow_type": "fiat_us_to_bridge_wallet",
  "amount": 1000.00,
  "virtual_account_id": "uuid-VA"
}
```

**Request Body — `bridge_wallet_to_fiat_bo` (Off-ramp BOB):**
```json
{
  "flow_type": "bridge_wallet_to_fiat_bo",
  "amount": 300.00,
  "wallet_id": "uuid-wallet-bridge",
  "destination_bank_name": "Banco Mercantil",
  "destination_account_number": "9876543210",
  "destination_account_holder": "María López",
  "destination_qr_url": "https://..."
}
```

**Request Body — `bridge_wallet_to_crypto` (Off-ramp Crypto):**
```json
{
  "flow_type": "bridge_wallet_to_crypto",
  "amount": 100.00,
  "wallet_id": "uuid-wallet-bridge",
  "destination_address": "0xExternalWallet...",
  "destination_network": "polygon",
  "destination_currency": "usdc"
}
```

**Request Body — `bridge_wallet_to_fiat_us` (Off-ramp USD):**
```json
{
  "flow_type": "bridge_wallet_to_fiat_us",
  "amount": 1000.00,
  "wallet_id": "uuid-wallet-bridge",
  "external_account_id": "uuid-cuenta-us"
}
```

---

### `GET /payment-orders` — Listar mis órdenes

**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Filtrar por estado |
| `flow_category` | string | `interbank` o `wallet_ramp` |
| `page` | number | Página |
| `limit` | number | Items por página |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "flow_type": "bolivia_to_world",
      "flow_category": "interbank",
      "status": "waiting_deposit",
      "amount": 1000.00,
      "source_currency": "bob",
      "destination_currency": "usd",
      "fee_amount": 20.00,
      "created_at": "..."
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

---

### `GET /payment-orders/:id` — Detalle de orden

**Response 200 (completa):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "flow_type": "bolivia_to_world",
  "flow_category": "interbank",
  "status": "deposit_received",
  "requires_psav": true,
  "amount": 1000.00,
  "source_currency": "bob",
  "destination_currency": "usd",
  "fee_amount": 20.00,
  "net_amount": 980.00,
  "exchange_rate_applied": 6.90,
  "amount_destination": 142.03,
  "destination_bank_name": null,
  "destination_account_number": null,
  "destination_account_holder": null,
  "destination_address": null,
  "destination_network": null,
  "external_account_id": "uuid",
  "psav_deposit_instructions": { "..." },
  "deposit_proof_url": "https://storage.../comprobante.jpg",
  "bridge_transfer_id": null,
  "bridge_source_deposit_instructions": null,
  "tx_hash": null,
  "provider_reference": null,
  "receipt_url": null,
  "business_purpose": "Pago a proveedor",
  "supporting_document_url": null,
  "failure_reason": null,
  "approved_by": null,
  "approved_at": null,
  "notes": null,
  "created_at": "...",
  "updated_at": "..."
}
```

---

### `GET /payment-orders/exchange-rates` — Todos los tipos de cambio

**Response 200:**
```json
[
  { "pair": "BOB_USD", "rate": 0.1449, "spread_percent": 1.50, "effective_rate": 0.1427 },
  { "pair": "USD_BOB", "rate": 6.90, "spread_percent": 1.50, "effective_rate": 7.0035 },
  { "pair": "BOB_USDC", "rate": 0.1449, "spread_percent": 1.50, "effective_rate": 0.1427 },
  { "pair": "USDC_BOB", "rate": 6.90, "spread_percent": 1.50, "effective_rate": 7.0035 }
]
```

**Notas Frontend:**
- Mostrar tipo de cambio en la pantalla de creación de orden
- Calcular monto estimado de recepción en tiempo real
- `effective_rate` incluye el spread

---

### `GET /payment-orders/exchange-rates/:pair` — TC de un par específico

---

### `POST /payment-orders/:id/confirm-deposit` — Confirmar depósito

**Request Body:**
```json
{
  "deposit_proof_url": "https://storage.../comprobante.jpg"
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "status": "deposit_received",
  "deposit_proof_url": "https://storage.../comprobante.jpg"
}
```

**Notas Frontend:**
- Disponible solo cuando `status === 'waiting_deposit'`
- El usuario debe subir una imagen del comprobante de depósito
- Usar el mismo flujo de upload de documentos para obtener la URL

---

### `POST /payment-orders/:id/cancel` — Cancelar orden

**Response 200:**
```json
{ "id": "uuid", "status": "cancelled" }
```

**Notas Frontend:**
- Solo se puede cancelar si `status === 'waiting_deposit'`
- Mostrar confirmación modal antes de cancelar

---

## Endpoints Admin

### `GET /admin/payment-orders` — Listar todas las órdenes

**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Filtrar estado |
| `flow_type` | string | Filtrar flujo específico |
| `flow_category` | string | `interbank` o `wallet_ramp` |
| `requires_psav` | boolean | Solo flujos PSAV |
| `user_id` | uuid | Órdenes de un usuario |
| `from_date` | ISO date | Desde fecha |
| `to_date` | ISO date | Hasta fecha |
| `page` | number | Página |
| `limit` | number | Items por página |

---

### `GET /admin/payment-orders/stats` — Estadísticas dashboard

**Response 200:**
```json
{
  "total_orders": 150,
  "by_status": {
    "waiting_deposit": 12,
    "deposit_received": 5,
    "processing": 3,
    "sent": 2,
    "completed": 120,
    "failed": 8
  },
  "volume_usd": 125000.00,
  "pending_review_count": 5
}
```

---

### `POST /admin/payment-orders/:id/approve` — Aprobar orden
**Roles:** staff, admin, super_admin

**Request Body:**
```json
{
  "notes": "Depósito verificado en cuenta PSAV"
}
```

**Efecto:** `deposit_received` → `processing`

---

### `POST /admin/payment-orders/:id/mark-sent` — Marcar como enviada
**Roles:** staff, admin, super_admin

**Request Body:**
```json
{
  "tx_hash": "0xABC123...",
  "provider_reference": "REF-BANCO-456"
}
```

**Efecto:** `processing` → `sent`

---

### `POST /admin/payment-orders/:id/complete` — Completar orden
**Roles:** admin, super_admin

**Request Body:**
```json
{
  "receipt_url": "https://storage.../recibo.pdf"
}
```

**Efecto:** `sent` → `completed`, liquida ledger entry

---

### `POST /admin/payment-orders/:id/fail` — Fallar orden
**Roles:** admin, super_admin

**Request Body:**
```json
{
  "reason": "Cuenta destino cerrada, fondos devueltos al usuario"
}
```

**Efecto:** Cualquier estado → `failed`, libera saldo reservado

---

### `GET /admin/payment-orders/psav-accounts` — Listar cuentas PSAV
### `POST /admin/payment-orders/psav-accounts` — Crear cuenta PSAV

```json
{
  "name": "PSAV Bolivia - BNB",
  "type": "bank_bo",
  "currency": "BOB",
  "bank_name": "Banco Nacional de Bolivia",
  "account_number": "1234567890",
  "account_holder": "PSAV SRL"
}
```

### `GET /admin/payment-orders/exchange-rates` — Tipos de cambio admin
### `POST /admin/payment-orders/exchange-rates/:pair` — Actualizar TC

```json
{
  "rate": 6.95,
  "spread_percent": 2.00
}
```

---

## Pantallas Frontend — Cliente

| Pantalla | Ruta | Descripción |
|----------|------|-------------|
| Selector de flujo | `/payment-orders/new` | Cards: Enviar al exterior, Fondear wallet, etc. |
| Formulario interbancario | `/payment-orders/interbank` | Form dinámico según flow_type |
| Formulario rampa | `/payment-orders/wallet-ramp` | Form dinámico según flow_type |
| Instrucciones depósito | `/payment-orders/:id/deposit` | Datos bancarios PSAV + upload comprobante |
| Detalle orden | `/payment-orders/:id` | Timeline de estados + datos completos |
| Mis órdenes | `/payment-orders` | Tabla/lista con filtros |

## Pantallas Frontend — Admin

| Pantalla | Ruta | Descripción |
|----------|------|-------------|
| Dashboard órdenes | `/admin/payment-orders` | Stats + tabla con filtros |
| Cola de aprobación | `/admin/payment-orders?status=deposit_received` | Órdenes pendientes de review |
| Detalle admin | `/admin/payment-orders/:id` | Datos completos + botones de acción |
| Gestión PSAV | `/admin/payment-orders/psav` | CRUD de cuentas PSAV |
| Tipos de cambio | `/admin/payment-orders/exchange-rates` | Editar TC y spreads |
