# 06 — Wallets y Ledger

> **Prefijo Wallets:** `/wallets` + `/admin/wallets`  
> **Prefijo Ledger:** `/ledger` + `/admin/ledger`

---

## Wallets — Endpoints de Usuario

### `GET /wallets` — Listar wallets activas
**Auth:** ✅ Bearer Token

**Response 200:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "currency": "usdc",
    "balance": "1500.00",
    "reserved_balance": "200.00",
    "available_balance": "1300.00",
    "is_active": true,
    "created_at": "..."
  }
]
```

**Datos a mostrar:**
- Balance total, balance reservado, balance disponible
- Moneda con ícono (USDC, USD, etc.)
- `available_balance = balance - reserved_balance`

---

### `GET /wallets/balances` — Balances de todas las monedas
**Response 200:**
```json
[
  {
    "currency": "usdc",
    "balance": "1500.00",
    "reserved_balance": "200.00",
    "available_balance": "1300.00"
  },
  {
    "currency": "usd",
    "balance": "0.00",
    "reserved_balance": "0.00",
    "available_balance": "0.00"
  }
]
```

**Notas Frontend:**
- Este es el endpoint principal para el dashboard
- Mostrar tarjetas por moneda con el balance destacado
- El `reserved_balance` son fondos retenidos por órdenes en proceso

---

### `GET /wallets/balances/:currency` — Balance de una moneda específica
**Ruta:** `/wallets/balances/usdc`

---

### `GET /wallets/payin-routes` — Rutas de pago disponibles
**Response 200:**
```json
[
  {
    "id": "uuid",
    "type": "virtual_account",
    "currency": "usd",
    "bank_name": "Lead Bank",
    "account_number": "123456789",
    "routing_number": "987654321",
    "status": "active"
  },
  {
    "id": "uuid",
    "type": "liquidation_address",
    "chain": "ethereum",
    "address": "0xABC...",
    "currency": "usdc",
    "status": "active"
  }
]
```

**Notas Frontend:**
- Mostrar en la pantalla de "Depositar fondos"
- Instrucciones bancarias para VA
- Dirección crypto con QR para liquidation addresses

---

### `GET /wallets/:id` — Detalle de una wallet

---

## Wallets — Endpoints Admin

### `POST /admin/wallets/balances/adjust` — Ajuste manual de balance
**Roles:** admin, super_admin

**Request Body:**
```json
{
  "user_id": "uuid",
  "currency": "usdc",
  "amount": 100.00,
  "reason": "Crédito de cortesía por inconveniente en transferencia"
}
```

**Notas:**
- `amount` positivo = crédito, negativo = débito
- Se crea un audit log automáticamente
- Se le prohíbe dejar el balance negativo

---

## Ledger — Endpoints de Usuario

### `GET /ledger` — Historial de movimientos
**Auth:** ✅ Bearer Token

**Query Params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | 1 | Página |
| `limit` | number | 50 | Items por página |
| `from` | ISO date | — | Fecha inicio |
| `to` | ISO date | — | Fecha fin |
| `type` | string | — | `credit` o `debit` |
| `currency` | string | — | Filtrar por moneda |
| `status` | string | — | `pending`, `settled`, `failed`, `reversed` |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "credit",
      "amount": "500.00",
      "currency": "usdc",
      "status": "settled",
      "description": "Depósito recibido vía Virtual Account",
      "reference_type": "bridge_transfer",
      "reference_id": "uuid",
      "balance_after": "1500.00",
      "created_at": "2026-01-15T10:30:00Z"
    },
    {
      "id": "uuid",
      "type": "debit",
      "amount": "200.00",
      "currency": "usdc",
      "status": "pending",
      "description": "Payout a Chase Bank ***6789",
      "reference_type": "payout_request",
      "reference_id": "uuid",
      "balance_after": "1300.00",
      "created_at": "2026-01-16T14:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

**Datos a mostrar:**
- Timeline/lista con ícono de crédito (↓ verde) o débito (↑ rojo)
- Monto, moneda, descripción
- Badge de estado: settled ✅, pending ⏳, failed ❌, reversed 🔄
- Filtros por fecha, tipo, moneda y estado
- Balance acumulado si se desea

---

### `GET /ledger/:id` — Detalle de un movimiento
**Response 200:**
```json
{
  "id": "uuid",
  "type": "credit",
  "amount": "500.00",
  "currency": "usdc",
  "status": "settled",
  "description": "Depósito recibido vía Virtual Account",
  "reference_type": "bridge_transfer",
  "reference_id": "uuid",
  "fee_amount": "0.00",
  "balance_before": "1000.00",
  "balance_after": "1500.00",
  "metadata": {},
  "created_at": "...",
  "settled_at": "..."
}
```

---

## Ledger — Endpoints Admin

### `POST /admin/ledger/adjustment` — Ajuste manual con justificación
**Roles:** admin, super_admin

**Request Body:**
```json
{
  "wallet_id": "uuid",
  "type": "credit",
  "amount": 50.00,
  "currency": "usdc",
  "reason": "Compensación por error en transferencia TX-123"
}
```

---

## Pantallas Frontend Requeridas

| Pantalla | Ruta sugerida | Actor | Descripción |
|----------|---------------|-------|-------------|
| Dashboard principal | `/dashboard` | Cliente | Cards de balance por moneda |
| Historial movimientos | `/ledger` | Cliente | Timeline con filtros |
| Detalle movimiento | `/ledger/:id` | Cliente | Info completa del entry |
| Admin ajuste balance | `/admin/wallets/adjust` | Admin | Form de ajuste manual |
