# Tabla: `public.compliance_reviews`

## Función de la Tabla
`compliance_reviews` abre un **expediente legal formal** cada vez que un proceso requiere la evaluación del equipo de cumplimiento (Compliance/Staff). A diferencia de simplemente cambiar un campo `status`, esta tabla crea un caso persistente, rastreable y auditable. Es el equivalente digital a un "folder de caso" en un departamento de cumplimiento físico.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del caso de revisión. |
| `subject_type` | `text` | NOT NULL, CHECK | — | Qué se está revisando: `'onboarding'`, `'payout_request'`, `'bridge_transfer'`. |
| `subject_id` | `uuid` | NOT NULL | — | ID del objeto bajo revisión en su tabla correspondiente. |
| `assigned_to` | `uuid` | nullable, FK → `profiles.id` | NULL | Staff member asignado al caso. NULL = sin asignar. |
| `status` | `text` | NOT NULL, CHECK | `'open'` | Estado del caso: `'open'`, `'in_progress'`, `'needs_changes'`, `'closed'`. |
| `priority` | `text` | NOT NULL, CHECK | `'normal'` | Prioridad: `'low'`, `'normal'`, `'high'`, `'urgent'`. Útil para casos de alto riesgo. |
| `due_date` | `date` | nullable | NULL | Fecha límite para resolución regulatoria (ej. respuesta a FinCEN en 30 días). |
| `opened_at` | `timestamptz` | NOT NULL | `now()` | Fecha de apertura del caso. |
| `closed_at` | `timestamptz` | nullable | NULL | Fecha de cierre (APPROVED o REJECTED). |

*RLS: Solo Staff y Admin pueden leer y actualizar. Los clientes no ven esta tabla directamente.*

## Relaciones
- **Apunta a:** `onboarding`, `payout_requests`, `bridge_transfers` via polimorfismo.
- **Asignado a:** `profiles` via `assigned_to`.
- **Tiene:** `compliance_review_comments` y `compliance_review_events`.

## Ejemplo JSON

```json
{
  "id": "rev11111-e89b-12d3-a456-426614174000",
  "subject_type": "onboarding",
  "subject_id": "111e4567-e89b-12d3-a456-426614174000",
  "assigned_to": "staff000-e89b-12d3-a456-426614174000",
  "status": "in_progress",
  "priority": "high",
  "due_date": "2026-04-10",
  "opened_at": "2026-03-26T10:00:00Z",
  "closed_at": null
}
```
