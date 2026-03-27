# Tabla: `public.customer_fee_overrides`

## Función de la Tabla
`customer_fee_overrides` permite definir tarifas personalizadas para clientes específicos, anulando los valores globales de `fees_config`. Esto es fundamental para una plataforma B2B donde clientes de alto volumen negocian condiciones especiales. El backend siempre busca primero si existe un override activo para el usuario; si no, usa la tarifa global.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del override. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente al que aplica esta tarifa personalizada. |
| `operation_type` | `text` | NOT NULL | — | Tipo de operación: `'deposit'`, `'withdrawal'`, etc. |
| `payment_rail` | `text` | NOT NULL | — | Vía de pago a la que aplica. |
| `currency` | `text` | NOT NULL | — | Divisa o `'all'`. |
| `fee_type` | `text` | NOT NULL, CHECK | — | Tipo: `'percent'`, `'fixed'`, `'percent_plus_fixed'`. |
| `fee_percent` | `numeric(10,4)` | nullable | NULL | Porcentaje negociado. |
| `fee_fixed` | `numeric(20,2)` | nullable | NULL | Monto fijo negociado. |
| `min_fee` | `numeric(20,2)` | nullable | NULL | Mínimo negociado. |
| `max_fee` | `numeric(20,2)` | nullable | NULL | Máximo negociado. |
| `is_active` | `boolean` | NOT NULL | `true` | Si el override está vigente. |
| `valid_from` | `date` | NOT NULL | `CURRENT_DATE` | Fecha desde la que aplica el override. |
| `valid_until` | `date` | nullable | NULL | Fecha de expiración. NULL = indefinido. |
| `notes` | `text` | nullable | NULL | Justificación del override (ej. "Cliente VIP, +$500K/mes de volumen"). |
| `created_by` | `uuid` | NOT NULL, FK → `profiles.id` | — | Admin que creó el override. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |

*RLS: Solo Admin puede crear/modificar. Staff puede leer. Clientes no tienen acceso.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Creado por:** `profiles` via `created_by`.

## Ejemplo JSON

```json
{
  "id": "ove11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "operation_type": "withdrawal",
  "payment_rail": "wire",
  "currency": "USD",
  "fee_type": "percent",
  "fee_percent": 0.20,
  "fee_fixed": null,
  "min_fee": 10.00,
  "max_fee": 200.00,
  "is_active": true,
  "valid_from": "2026-01-01",
  "valid_until": "2026-12-31",
  "notes": "Cliente VIP. Volumen mensual +$2M USD. Tarifa preferencial negociada en contrato.",
  "created_by": "admin000-e89b-12d3-a456-426614174000",
  "created_at": "2026-01-01T00:00:00Z"
}
```
