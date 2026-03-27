# Tabla: `public.reconciliation_runs`

## Función de la Tabla
`reconciliation_runs` registra cada ejecución del proceso de conciliación entre los saldos en `balances` (modelo mutable) y la suma matemática de `ledger_entries` (fuente de verdad inmutable). Este proceso es crítico en sistemas financieros de producción: garantiza que ninguna fila de `balances` haya divergido de su ledger por bugs, fallos de trigger o intervenciones manuales. Se ejecuta automáticamente comme job nocturno y puede ser disparado manualmente por un Admin.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único de la ejecución de conciliación. |
| `initiated_by` | `uuid` | nullable, FK → `profiles.id` | NULL | Admin que disparó manualmente el proceso. NULL si es automático (CRON). |
| `run_type` | `text` | NOT NULL, CHECK | `'scheduled'` | Tipo de ejecución: `'scheduled'` (automático) o `'manual'` (Admin lo disparó). |
| `status` | `text` | NOT NULL, CHECK | `'running'` | Estado: `'running'`, `'completed'`, `'completed_with_warnings'`, `'failed'`. |
| `users_checked` | `integer` | NOT NULL | `0` | Número de usuarios/cuentas verificados en esta ejecución. |
| `currencies_checked` | `text[]` | nullable | NULL | Divisas que se conciliaron en esta ejecución (ej. `['USD', 'USDC', 'EUR']`). |
| `discrepancies_found` | `integer` | NOT NULL | `0` | Número de discrepancias detectadas entre `balances` y `SUM(ledger_entries)`. |
| `discrepancies_detail` | `jsonb` | nullable | NULL | Detalle de cada discrepancia: usuario, divisa, monto en balances, monto calculado, diferencia. |
| `auto_corrected` | `boolean` | NOT NULL | `false` | Si el proceso aplicó correcciones automáticas (solo para diferencias menores a un umbral). |
| `auto_corrections_detail` | `jsonb` | nullable | NULL | Detalle de las correcciones automáticas aplicadas (log de cada UPDATE en `balances`). |
| `requires_manual_review` | `boolean` | NOT NULL | `false` | Si existen discrepancias grandes que requieren revisión manual por el equipo financiero. |
| `error_message` | `text` | nullable | NULL | Mensaje de error si el proceso falló. |
| `started_at` | `timestamptz` | NOT NULL | `now()` | Inicio de la ejecución. |
| `completed_at` | `timestamptz` | nullable | NULL | Fin exitoso de la ejecución. |
| `duration_ms` | `integer` | nullable | NULL | Duración total de la ejecución en milisegundos (para monitoreo de performance). |

*RLS: Solo `service_role` puede INSERT y UPDATE. Admin puede SELECT. Staff puede SELECT si requires_manual_review = true.*

## Lógica del Proceso de Conciliación

```sql
-- Comparación para cada usuario y divisa:
SELECT 
    b.user_id,
    b.currency,
    b.amount AS balance_amount,
    COALESCE(SUM(le.amount), 0) AS ledger_sum,
    b.amount - COALESCE(SUM(le.amount), 0) AS discrepancy
FROM balances b
LEFT JOIN ledger_entries le 
    ON le.wallet_id IN (
        SELECT id FROM wallets WHERE user_id = b.user_id
    )
    AND le.currency = b.currency
    AND le.status = 'settled'
GROUP BY b.user_id, b.currency, b.amount
HAVING ABS(b.amount - COALESCE(SUM(le.amount), 0)) > 0.000001  -- tolerancia mínima
ORDER BY discrepancy DESC;
```

## Relaciones
- **Disparado por:** `profiles` via `initiated_by`.
- **Analiza:** `balances` vs `ledger_entries`.
- **Si hay discrepancias:** Puede crear `audit_logs` y `notifications` para el equipo financiero.

## Ejemplo JSON — Ejecución Sin Discrepancias

```json
{
  "id": "rec11111-e89b-12d3-a456-426614174000",
  "initiated_by": null,
  "run_type": "scheduled",
  "status": "completed",
  "users_checked": 847,
  "currencies_checked": ["USD", "USDC", "EUR"],
  "discrepancies_found": 0,
  "discrepancies_detail": null,
  "auto_corrected": false,
  "requires_manual_review": false,
  "error_message": null,
  "started_at": "2026-03-27T02:00:00Z",
  "completed_at": "2026-03-27T02:00:45Z",
  "duration_ms": 45320
}
```

## Ejemplo JSON — Ejecución Con Discrepancia

```json
{
  "id": "rec22222-e89b-12d3-a456-426614174000",
  "run_type": "manual",
  "initiated_by": "admin000-e89b-12d3-a456-426614174000",
  "status": "completed_with_warnings",
  "users_checked": 847,
  "discrepancies_found": 1,
  "discrepancies_detail": [
    {
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "currency": "USD",
      "balance_amount": 15320.50,
      "ledger_sum": 15320.00,
      "discrepancy": 0.50,
      "investigation_note": "Posible rounding error en fee cálculo del transfer trans_abc"
    }
  ],
  "auto_corrected": false,
  "requires_manual_review": true,
  "started_at": "2026-03-27T10:00:00Z",
  "completed_at": "2026-03-27T10:01:10Z"
}
```
