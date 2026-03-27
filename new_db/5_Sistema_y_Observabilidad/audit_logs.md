# Tabla: `public.audit_logs`

## Función de la Tabla
`audit_logs` es el **libro de auditoría inmutable** de la plataforma. Registra cada acción sensible realizada por Staff o Admin sobre los datos de los clientes: cambios de estado, ajustes manuales de saldo, congelamiento de cuentas, aprobaciones. Esta tabla es la principal herramienta de defensa ante litigios, auditorías regulatorias (SOC-2, FinCEN) y disputas internas. **Nadie puede UPDATE ni DELETE en esta tabla.**

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único del registro de auditoría. |
| `performed_by` | `uuid` | NOT NULL, FK → `profiles.id` | — | Staff o Admin que ejecutó la acción. |
| `role` | `text` | NOT NULL, CHECK | — | Rol con el que actuó: `'staff'`, `'admin'`. |
| `action` | `text` | NOT NULL | — | Acción descriptiva estandarizada (ej. `'FREEZE_WALLET'`, `'APPROVE_ONBOARDING'`, `'MANUAL_LEDGER_ADJUSTMENT'`). |
| `table_name` | `text` | NOT NULL | — | Tabla de base de datos afectada. |
| `record_id` | `uuid` | NOT NULL | — | ID de la fila afectada en esa tabla. |
| `affected_fields` | `text[]` | nullable | NULL | Array de campos que cambiaron (ej. `['status', 'observations']`). |
| `previous_values` | `jsonb` | nullable | NULL | Snapshot del registro antes del cambio. |
| `new_values` | `jsonb` | nullable | NULL | Snapshot del registro después del cambio. |
| `reason` | `text` | NOT NULL | — | Justificación escrita obligatoria de la acción. No puede estar vacío. |
| `source` | `text` | NOT NULL, CHECK | `'admin_panel'` | Desde dónde se ejecutó: `'admin_panel'`, `'api'`, `'bridge_webhook'`, `'cron_job'`. |
| `ip_address` | `text` | nullable | NULL | IP desde la que se realizó la acción (para trazabilidad geográfica). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Timestamp inmutable de la acción. |

*RLS: Solo `service_role` puede INSERT. Staff y Admin pueden SELECT. NADIE puede UPDATE ni DELETE.*

## Relaciones
- **Realizado por:** `profiles` via `performed_by`.

## Ejemplo JSON

```json
{
  "id": "aud11111-e89b-12d3-a456-426614174000",
  "performed_by": "admin000-e89b-12d3-a456-426614174000",
  "role": "admin",
  "action": "FREEZE_WALLET",
  "table_name": "wallets",
  "record_id": "wal11111-e89b-12d3-a456-426614174000",
  "affected_fields": ["is_frozen"],
  "previous_values": { "is_frozen": false },
  "new_values": { "is_frozen": true },
  "reason": "Investigación por sospecha de lavado de dinero — ticket OFAC-2026-005",
  "source": "admin_panel",
  "ip_address": "192.168.1.10",
  "created_at": "2026-03-26T20:00:00Z"
}
```
