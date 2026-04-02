# 05 — Bridge (Virtual Accounts, External Accounts, Payouts, Transfers)

> **Prefijo Usuario:** `/bridge`  
> **Prefijo Admin:** `/admin/bridge`

---

## Virtual Accounts (Cuentas Virtuales para Depósitos)

### `POST /bridge/virtual-accounts` — Crear Virtual Account
**Auth:** ✅ Bearer Token

**Request Body:**
```json
{
  "currency": "usd",
  "source_currency": "usd",
  "destination_currency": "usdc",
  "destination_payment_rail": "ethereum",
  "destination_address": "0x..."
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "bridge_virtual_account_id": "va_abc123",
  "status": "active",
  "currency": "usd",
  "source_deposit_instructions": {
    "bank_name": "Lead Bank",
    "account_number": "123456789",
    "routing_number": "987654321",
    "account_holder": "Bridge Financial",
    "swift_code": "LEADUS33",
    "deposit_message": "VA-abc123"
  },
  "created_at": "..."
}
```

**Datos a mostrar:**
- Instrucciones bancarias completas para que el usuario haga transferencia
- Número de cuenta, routing number, beneficiario
- Mensaje/referencia obligatoria para el depósito

---

### `GET /bridge/virtual-accounts` — Listar Virtual Accounts

**Response 200:**
```json
[
  {
    "id": "uuid",
    "currency": "usd",
    "status": "active",
    "bridge_virtual_account_id": "va_abc123",
    "created_at": "..."
  }
]
```

---

### `GET /bridge/virtual-accounts/:id` — Detalle con instrucciones
### `DELETE /bridge/virtual-accounts/:id` — Desactivar

---

## External Accounts (Cuentas Bancarias Destino)

### `POST /bridge/external-accounts` — Registrar cuenta bancaria destino
**Auth:** ✅ Bearer Token

**Request Body:**
```json
{
  "currency": "usd",
  "account_type": "us",
  "first_name": "Juan",
  "last_name": "Pérez",
  "account_number": "123456789",
  "routing_number": "021000021",
  "bank_name": "Chase Bank",
  "account_owner_type": "individual"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "bridge_external_account_id": "ea_xyz789",
  "currency": "usd",
  "bank_name": "Chase Bank",
  "account_number_last4": "6789",
  "status": "active",
  "created_at": "..."
}
```

**Notas Frontend:**
- Mostrar solo los últimos 4 dígitos de la cuenta
- El usuario puede tener múltiples cuentas destino
- Mostrar con ícono de banco y label descriptivo

---

### `GET /bridge/external-accounts` — Listar cuentas registradas
### `DELETE /bridge/external-accounts/:id` — Desactivar cuenta

---

## Payouts (Solicitudes de Pago Bridge)

### `POST /bridge/payouts` — Crear solicitud de pago
**Auth:** ✅ Bearer Token

**Request Body:**
```json
{
  "source_currency": "usdc",
  "destination_currency": "usd",
  "amount": "500.00",
  "external_account_id": "uuid-external-account",
  "description": "Pago a proveedor"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "status": "pending_review",
  "amount": "500.00",
  "fee_amount": "3.75",
  "net_amount": "496.25",
  "source_currency": "usdc",
  "destination_currency": "usd",
  "external_account_id": "uuid",
  "created_at": "..."
}
```

**Notas Frontend:**
- Mostrar desglose: monto bruto, fee, monto neto
- Estado puede ser `pending_review` si supera umbral
- Mostrar advertencia de saldo reservado

---

### `GET /bridge/payouts` — Listar mis solicitudes de pago
### `GET /bridge/payouts/:id` — Detalle de una solicitud

---

## Transfers (Historial de Transferencias Bridge)

### `GET /bridge/transfers` — Historial de transferencias
**Response 200:**
```json
[
  {
    "id": "uuid",
    "bridge_transfer_id": "tf_abc123",
    "status": "completed",
    "amount": "500.00",
    "currency": "usdc",
    "direction": "outbound",
    "completed_at": "...",
    "created_at": "..."
  }
]
```

---

### `GET /bridge/transfers/:id` — Detalle de transferencia
### `POST /bridge/transfers/:id/sync` — Sincronizar estado manualmente

---

## Liquidation Addresses (Direcciones Crypto → Fiat)

### `POST /bridge/liquidation-addresses` — Crear dirección de liquidación
**Request Body:**
```json
{
  "chain": "ethereum",
  "currency": "usdc",
  "destination_currency": "usd",
  "destination_payment_rail": "ach",
  "external_account_id": "uuid"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "address": "0xABC...",
  "chain": "ethereum",
  "currency": "usdc",
  "status": "active"
}
```

**Notas Frontend:**
- El usuario envía crypto a esta dirección
- Bridge la convierte automáticamente a fiat y deposita en la external account
- Mostrar dirección con botón de copiar y QR

---

### `GET /bridge/liquidation-addresses` — Listar direcciones activas

---

## Endpoints Admin — Bridge

### `POST /admin/bridge/payouts/:id/approve` — Aprobar payout pendiente
**Roles:** staff, admin, super_admin

### `POST /admin/bridge/payouts/:id/reject` — Rechazar payout
**Roles:** staff, admin, super_admin

```json
{ "reason": "Monto excede límites permitidos" }
```

---

## Pantallas Frontend Requeridas

| Pantalla | Ruta sugerida | Actor | Descripción |
|----------|---------------|-------|-------------|
| Cuentas virtuales | `/bridge/virtual-accounts` | Cliente | Lista + instrucciones de depósito |
| Cuentas destino | `/bridge/external-accounts` | Cliente | Lista + agregar nueva cuenta bancaria |
| Crear payout | `/bridge/payouts/new` | Cliente | Formulario de retiro/pago |
| Historial payouts | `/bridge/payouts` | Cliente | Lista con estados |
| Historial transfers | `/bridge/transfers` | Cliente | Timeline de transferencias |
| Direcciones liquidación | `/bridge/liquidation` | Cliente | Addresses crypto con QR |
| Admin payouts | `/admin/bridge/payouts` | Admin | Cola de aprobación |
