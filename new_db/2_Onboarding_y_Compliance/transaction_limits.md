# Tabla: `public.transaction_limits`

## Función de la Tabla
`transaction_limits` define los límites operacionales de cada usuario para cumplir con las normativas AML (Anti-Money Laundering). Estos límites controlan cuánto puede transaccionar un cliente por día, semana o mes, según su nivel de verificación y perfil de riesgo. Son validados por el backend antes de procesar cualquier payout o depósito. Los límites globales se configuran en `app_settings` y los individuales aquí.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único del registro de límites. |
| `user_id` | `uuid` | UNIQUE, NOT NULL, FK → `profiles.id` | — | Usuario al que aplican los límites. Relación 1:1 con profiles. |
| `tier` | `text` | NOT NULL, CHECK | `'standard'` | Nivel de verificación: `'standard'` (KYC básico), `'enhanced'` (KYC completo), `'vip'` (acuerdo especial). |
| `daily_deposit_limit` | `numeric(20,2)` | NOT NULL | `10000` | Límite máximo diario de depósitos en USD equivalente. |
| `daily_payout_limit` | `numeric(20,2)` | NOT NULL | `5000` | Límite máximo diario de retiros/payouts en USD equivalente. |
| `weekly_deposit_limit` | `numeric(20,2)` | NOT NULL | `50000` | Límite semanal (rolling 7 días) de depósitos. |
| `weekly_payout_limit` | `numeric(20,2)` | NOT NULL | `25000` | Límite semanal de retiros. |
| `monthly_deposit_limit` | `numeric(20,2)` | NOT NULL | `100000` | Límite mensual (calendario) de depósitos. |
| `monthly_payout_limit` | `numeric(20,2)` | NOT NULL | `50000` | Límite mensual de retiros. |
| `single_txn_limit` | `numeric(20,2)` | NOT NULL | `10000` | Monto máximo por transacción individual (payout o depósito). |
| `single_txn_above_review` | `numeric(20,2)` | NOT NULL | `5000` | Si una transacción supera este monto, requiere revisión de compliance antes de ejecutarse. |
| `applied_by` | `uuid` | nullable, FK → `profiles.id` | NULL | Staff/Admin que configuró estos límites (NULL = límites automáticos por tier). |
| `reason` | `text` | nullable | NULL | Justificación del cambio si difiere de los límites estándar del tier. |
| `effective_from` | `timestamptz` | NOT NULL | `now()` | Desde cuándo aplican estos límites. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

**UNIQUE CONSTRAINT:** `(user_id)` — Un solo conjunto de límites activos por usuario.

*RLS: El cliente solo puede leer sus propios límites (no modificar). Solo Staff/Admin pueden UPDATE.*

## Lógica de Validación (Backend)

```sql
-- Antes de crear un payout_request de $3,000:
SELECT 
    t.single_txn_limit >= 3000 AS ok_single_txn,
    t.single_txn_above_review < 3000 AS need_review,
    COALESCE(SUM(le.amount), 0) + 3000 <= t.daily_payout_limit AS ok_daily,
    COALESCE(SUM(le.amount), 0) + 3000 <= t.monthly_payout_limit AS ok_monthly
FROM transaction_limits t
LEFT JOIN ledger_entries le ON le.wallet_id IN (
    SELECT id FROM wallets WHERE user_id = :user_id
) AND le.type = 'withdrawal'
  AND le.created_at >= NOW() - INTERVAL '1 day'
WHERE t.user_id = :user_id;
```

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Configurado por:** `profiles` via `applied_by`.

## Ejemplo JSON

```json
{
  "id": "lim11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "tier": "enhanced",
  "daily_deposit_limit": 50000.00,
  "daily_payout_limit": 25000.00,
  "weekly_deposit_limit": 200000.00,
  "weekly_payout_limit": 100000.00,
  "monthly_deposit_limit": 500000.00,
  "monthly_payout_limit": 250000.00,
  "single_txn_limit": 50000.00,
  "single_txn_above_review": 10000.00,
  "applied_by": "admin000-e89b-12d3-a456-426614174000",
  "reason": "Cliente verificado con KYB completo y fuente de fondos validada.",
  "effective_from": "2026-01-16T14:30:00Z",
  "created_at": "2026-01-16T14:30:00Z",
  "updated_at": "2026-01-16T14:30:00Z"
}
```
