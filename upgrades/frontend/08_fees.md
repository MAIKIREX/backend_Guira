# 08 — Fees (Tarifas)

> **Prefijo Usuario:** `/fees`  
> **Prefijo Admin:** `/admin/fees`

---

## Endpoints de Usuario

### `GET /fees` — Listar tarifas vigentes
**Auth:** ✅ Bearer Token

**Response 200:**
```json
[
  {
    "id": "uuid",
    "operation_type": "interbank_bo_out",
    "payment_rail": "psav",
    "currency": "bob",
    "fee_type": "mixed",
    "fee_percent": 1.50,
    "fee_fixed": 5.00,
    "min_fee": 10.00,
    "max_fee": null,
    "description": "Bolivia → Exterior (mediado PSAV)",
    "is_active": true
  },
  {
    "id": "uuid",
    "operation_type": "ramp_on_bo",
    "payment_rail": "psav",
    "currency": "bob",
    "fee_type": "mixed",
    "fee_percent": 1.50,
    "fee_fixed": 3.00,
    "min_fee": 8.00,
    "max_fee": null,
    "description": "Fiat(BO) → Wallet Bridge (PSAV)"
  }
]
```

**Cálculo del fee:**
```
fee_type = 'percent'  → fee = amount * fee_percent / 100
fee_type = 'fixed'    → fee = fee_fixed
fee_type = 'mixed'    → fee = max(fee_fixed + amount * fee_percent / 100, min_fee)
                         si max_fee → fee = min(fee, max_fee)
```

**Notas Frontend:**
- Mostrar tabla de tarifas en página informativa
- Calcular fee estimado en formularios de creación de órdenes
- Mostrar desglose: Monto bruto, Fee, Monto neto

---

## Endpoints Admin

### `GET /admin/fees` — Todas las tarifas (activas e inactivas)
**Roles:** staff, admin, super_admin

### `POST /admin/fees` — Crear tarifa
**Roles:** admin, super_admin

```json
{
  "operation_type": "custom_transfer",
  "payment_rail": "bridge",
  "currency": "usdc",
  "fee_type": "percent",
  "fee_percent": 0.75,
  "fee_fixed": null,
  "min_fee": 2.00,
  "max_fee": 100.00,
  "description": "Nueva tarifa custom",
  "is_active": true
}
```

### `PATCH /admin/fees/:id` — Actualizar tarifa
**Roles:** admin, super_admin

```json
{
  "fee_percent": 1.00,
  "is_active": false
}
```

### `GET /admin/fees/overrides/:userId` — Overrides de un usuario
**Roles:** staff, admin, super_admin

**Response 200:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "operation_type": "interbank_bo_out",
    "fee_percent": 0.50,
    "fee_fixed": 2.00,
    "reason": "Cliente VIP"
  }
]
```

### `POST /admin/fees/overrides` — Crear override VIP
**Roles:** admin, super_admin

```json
{
  "user_id": "uuid",
  "operation_type": "interbank_bo_out",
  "fee_percent": 0.50,
  "fee_fixed": 2.00,
  "reason": "Cliente corporativo con alto volumen"
}
```

---

## Pantallas Frontend

| Pantalla | Actor | Descripción |
|----------|-------|-------------|
| Tabla de tarifas | Cliente | Info pública de comisiones |
| Admin tarifas | Admin | CRUD de tarifas |
| Admin overrides | Admin | Gestión de tarifas especiales por usuario |
