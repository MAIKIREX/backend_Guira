# Tabla: `public.balances`

## Función de la Tabla
`balances` es la tabla maestra del **saldo financiero consolidado** de cada cliente, separado por divisa. Representa el patrimonio virtual disponible dentro de la plataforma en un momento dado: es el número que el cliente ve en su dashboard. A diferencia del ledger puro (donde calculas el balance sumando entradas), esta tabla almacena el saldo como una **variable agregada actualizada por triggers y procesos internos** — lo que permite consultas instantáneas sin agregar millones de filas de ledger en tiempo real.

**Modelo Híbrido:** `balances` guarda el saldo visible y operativo. `ledger_entries` guarda el historial completo de movimientos para auditoría e inmutabilidad. Ambas se mantienen sincronizadas a través de triggers PostgreSQL y el worker asíncrono.

> ⚠️ **CRÍTICO:** Solo el `service_role` (backend/trigger) puede mutar el campo `amount`. Ningún cliente ni Staff puede modificarlo directamente. Toda mutación proviene de una `ledger_entry` procesada.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único del registro de balance. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Propietario del balance. |
| `currency` | `text` | NOT NULL | — | Divisa del balance: `'USD'`, `'USDC'`, `'EUR'`, `'USDT'`. Un usuario tiene una fila por cada divisa activa. |
| `amount` | `numeric(20,6)` | NOT NULL | `0` | Saldo actual neto. Solo se actualiza por triggers internos al procesar `ledger_entries`. **Nunca hace UPDATE manual.** |
| `pending_amount` | `numeric(20,6)` | NOT NULL | `0` | Saldo en tránsito (depósitos confirmados pero aún en proceso de acreditación, o retiros aprobados pero no completados). |
| `reserved_amount` | `numeric(20,6)` | NOT NULL | `0` | Monto bloqueado por operaciones en curso (retiros pendientes aún no ejecutados). No se puede usar. |
| `available_amount` | `numeric(20,6)` | NOT NULL | `0` | Saldo disponible real = `amount - reserved_amount`. Este es el que valida si se puede crear un nuevo payout. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación del registro. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última vez que el balance cambió. |

**UNIQUE CONSTRAINT:** `(user_id, currency)` — Una sola fila de balance por divisa por usuario.

*RLS: El cliente puede SELECT su propio balance. Solo `service_role` puede UPDATE.*

## Lógica de Actualización (Trigger)

```sql
-- Cuando se inserta una ledger_entry con status = 'settled':
UPDATE balances
SET amount = amount + NEW.amount,
    available_amount = amount + NEW.amount - reserved_amount,
    updated_at = NOW()
WHERE user_id = (SELECT user_id FROM wallets WHERE id = NEW.wallet_id)
  AND currency = NEW.currency;
```

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Actualizado por:** `ledger_entries` (via trigger o worker asíncrono).
- **Consultado por:** Toda lógica de validación de saldo antes de crear un `payout_request`.

## Disponibilidad para Nuevo Payout

```sql
-- Validación antes de crear un payout de $2,000 USD:
SELECT available_amount >= 2000
FROM balances
WHERE user_id = :user_id AND currency = 'USD';
```

## Ejemplo JSON

```json
{
  "id": "bal11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "currency": "USD",
  "amount": 15320.50,
  "pending_amount": 5000.00,
  "reserved_amount": 2000.00,
  "available_amount": 13320.50,
  "created_at": "2026-01-16T10:00:00Z",
  "updated_at": "2026-03-26T18:01:00Z"
}
```
