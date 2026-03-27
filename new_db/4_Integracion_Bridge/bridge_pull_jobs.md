# Tabla: `public.bridge_pull_jobs`

## Función de la Tabla
`bridge_pull_jobs` registra los trabajos de sincronización forzada con Bridge API. Cuando se sospecha que hay discrepancias entre el estado local y el estado real en Bridge (por webhooks perdidos, caídas de red, o simplemente como mantenimiento preventivo), un Admin puede lanzar un "Pull Job" que consulta Bridge para un rango de fechas y reconcilia cualquier diferencia. Esta tabla guarda el historial de esas verificaciones.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del job. |
| `initiated_by` | `uuid` | NOT NULL, FK → `profiles.id` | — | Admin que lanzó el job de sincronización. |
| `job_type` | `text` | NOT NULL, CHECK | — | Tipo de sincronización: `'TRANSFER_SYNC'`, `'VIRTUAL_ACCOUNT_SYNC'`, `'FULL_RECONCILIATION'`. |
| `target_user_id` | `uuid` | nullable, FK → `profiles.id` | NULL | Si el job es para un cliente específico. NULL = todos los clientes. |
| `date_range_from` | `timestamptz` | NOT NULL | — | Inicio del rango de fechas a consultar en Bridge. |
| `date_range_to` | `timestamptz` | NOT NULL | — | Fin del rango de fechas. |
| `status` | `text` | NOT NULL, CHECK | `'running'` | Estado: `'running'`, `'completed'`, `'failed'`. |
| `records_checked` | `integer` | nullable | NULL | Total de registros revisados en Bridge. |
| `gaps_found` | `integer` | nullable | `0` | Cantidad de discrepancias encontradas entre Bridge y la DB local. |
| `gaps_detail` | `jsonb` | nullable | `'[]'` | Detalle de cada discrepancia: `[{ "bridge_id": "trans_missing", "amount": 500, "type": "transfer" }]`. |
| `actions_taken` | `jsonb` | nullable | `'[]'` | Correcciones automáticas aplicadas: `[{ "action": "created_ledger_entry", "id": "..." }]`. |
| `error_message` | `text` | nullable | NULL | Mensaje de error si el job falló. |
| `started_at` | `timestamptz` | NOT NULL | `now()` | Inicio del job. |
| `completed_at` | `timestamptz` | nullable | NULL | Fin del job. |

*RLS: Solo Admin puede crear y leer jobs. Staff puede ver resultados.*

## Relaciones
- **Iniciado por:** `profiles` via `initiated_by`.

## Ejemplo JSON

```json
{
  "id": "bpj11111-e89b-12d3-a456-426614174000",
  "initiated_by": "admin000-e89b-12d3-a456-426614174000",
  "job_type": "TRANSFER_SYNC",
  "target_user_id": null,
  "date_range_from": "2026-03-20T00:00:00Z",
  "date_range_to": "2026-03-26T23:59:59Z",
  "status": "completed",
  "records_checked": 147,
  "gaps_found": 2,
  "gaps_detail": [
    { "bridge_id": "trans_missing_abc", "amount": 320.00, "currency": "usd", "type": "transfer" },
    { "bridge_id": "trans_missing_xyz", "amount": 1500.00, "currency": "usd", "type": "transfer" }
  ],
  "actions_taken": [
    { "action": "created_ledger_entry", "reference": "led_recovery_001" },
    { "action": "created_ledger_entry", "reference": "led_recovery_002" }
  ],
  "error_message": null,
  "started_at": "2026-03-26T19:00:00Z",
  "completed_at": "2026-03-26T19:02:31Z"
}
```
