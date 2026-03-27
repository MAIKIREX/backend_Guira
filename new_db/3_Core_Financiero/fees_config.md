# Tabla: `public.fees_config`

## Función de la Tabla
`fees_config` es la tabla maestra de tarifas de la plataforma. Define el costo de cada tipo de operación financiera (depósito, retiro, conversión) por vía de pago y divisa. Es consultada en tiempo real cada vez que se calcula el costo de una transacción. Las tarifas aquí son las globales de la plataforma; los clientes VIP pueden tener overrides en `customer_fee_overrides`.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único de la configuración de tarifa. |
| `operation_type` | `text` | NOT NULL, CHECK | — | Tipo de operación: `'deposit'`, `'withdrawal'`, `'conversion'`, `'transfer'`. |
| `payment_rail` | `text` | NOT NULL | — | Vía de pago aplicable: `'ach'`, `'wire'`, `'sepa'`, `'swift'`, `'crypto'`, `'all'`. |
| `currency` | `text` | NOT NULL | — | Divisa aplicable o `'all'` para todas las divisas. |
| `fee_type` | `text` | NOT NULL, CHECK | — | Tipo de tarifa: `'percent'` (porcentaje del monto), `'fixed'` (monto fijo), `'percent_plus_fixed'` (combinada). |
| `fee_percent` | `numeric(10,4)` | nullable | NULL | Porcentaje aplicado (ej. `1.5` = 1.5%). |
| `fee_fixed` | `numeric(20,2)` | nullable | NULL | Monto fijo (ej. `10.00` = $10 USD). |
| `min_fee` | `numeric(20,2)` | nullable | NULL | Tarifa mínima a cobrar aunque el porcentaje sea menor. |
| `max_fee` | `numeric(20,2)` | nullable | NULL | Tarifa máxima (techo). NULL = sin límite. |
| `is_active` | `boolean` | NOT NULL | `true` | Si esta configuración está vigente. |
| `description` | `text` | nullable | NULL | Descripción legible para el backoffice. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: Solo Admin puede crear/modificar. Staff puede leer. Clientes no tienen acceso directo.*

## Relaciones
Esta tabla es consultada por el backend al calcular comisiones para `payment_orders`, `payout_requests` y `bridge_transfers`.

## Ejemplo JSON

```json
{
  "id": "fee11111-e89b-12d3-a456-426614174000",
  "operation_type": "withdrawal",
  "payment_rail": "wire",
  "currency": "USD",
  "fee_type": "percent_plus_fixed",
  "fee_percent": 0.50,
  "fee_fixed": 15.00,
  "min_fee": 20.00,
  "max_fee": 500.00,
  "is_active": true,
  "description": "Retiro via Wire USD: 0.5% + $15, mínimo $20, máximo $500.",
  "updated_at": "2026-03-01T00:00:00Z"
}
```
