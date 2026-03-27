# Tabla: `public.payin_routes`

## Función de la Tabla
`payin_routes` define las vías de entrada de dinero habilitadas en la plataforma, a nivel global o por cliente específico. Permite al equipo de operaciones configurar qué canales de pago están activos (ACH, Wire, SEPA, Crypto) sin necesidad de cambios en el código. También almacena configuraciones como tarifas aplicadas, montos mínimos/máximos y si se requiere revisión manual.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único de la ruta de entrada. |
| `name` | `text` | NOT NULL | — | Nombre descriptivo de la ruta (ej. `'USD ACH Push'`, `'USDC Ethereum'`). |
| `payment_rail` | `text` | NOT NULL, CHECK | — | Canal: `'ach_push'`, `'wire'`, `'sepa'`, `'crypto_usdc'`, `'crypto_usdt'`. |
| `currency` | `text` | NOT NULL | — | Divisa aceptada por esta ruta (`'USD'`, `'EUR'`, `'USDC'`). |
| `is_active` | `boolean` | NOT NULL | `true` | Si la ruta está habilitada actualmente. |
| `min_amount` | `numeric(20,2)` | NOT NULL | `1.00` | Monto mínimo aceptado por esta ruta. |
| `max_amount` | `numeric(20,2)` | nullable | NULL | Monto máximo (NULL = sin límite). |
| `requires_review` | `boolean` | NOT NULL | `false` | Si depósitos por esta ruta requieren aprobación manual del Staff. |
| `fee_type` | `text` | NOT NULL, CHECK | `'percent'` | Cómo se cobra la tarifa: `'percent'` o `'fixed'`. |
| `fee_value` | `numeric(10,4)` | NOT NULL | `0` | Valor de la tarifa (ej. `1.5` para 1.5% o `10.00` para $10 fijo). |
| `description` | `text` | nullable | NULL | Descripción de la ruta para mostrar en la UI. |
| `metadata` | `jsonb` | nullable | `'{}'` | Configuración adicional específica del proveedor. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: Solo Admin puede crear/modificar. Staff y clientes pueden leer las activas.*

## Relaciones
- **Referenciada por:** `payment_orders` via `payin_route_id`.

## Ejemplo JSON

```json
{
  "id": "rte11111-e89b-12d3-a456-426614174000",
  "name": "USD Wire (Bridge Virtual Account)",
  "payment_rail": "wire",
  "currency": "USD",
  "is_active": true,
  "min_amount": 100.00,
  "max_amount": 500000.00,
  "requires_review": false,
  "fee_type": "percent",
  "fee_value": 0.5,
  "description": "Recibe wires bancarios USD via cuenta virtual de Bridge. Acreditación en 1-2 días hábiles.",
  "metadata": { "bridge_source_currency": "usd" },
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-03-01T00:00:00Z"
}
```
