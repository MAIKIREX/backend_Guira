# Tabla: `public.support_tickets`

## Función de la Tabla
`support_tickets` es el sistema de help desk integrado: el cliente puede abrir un ticket desde la aplicación cuando tiene un problema, y el Staff lo atiende desde el backoffice. Proporciona un canal de comunicación estructurado especialmente importante cuando un usuario reporta problemas con una transferencia o depósito.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `gen_random_uuid()` | ID único del ticket. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente que abrió el ticket. |
| `assigned_to` | `uuid` | nullable, FK → `profiles.id` | NULL | Staff member asignado para resolverlo. NULL = sin asignar. |
| `subject` | `text` | NOT NULL | — | Asunto descriptivo del problema (ej. `'Depósito no acreditado'`, `'Retiro demorado'`). |
| `message` | `text` | NOT NULL | — | Descripción detallada del problema por parte del cliente. |
| `contact_email` | `text` | NOT NULL | — | Email de contacto para respuestas off-platform si es necesario. |
| `contact_phone` | `text` | nullable | NULL | Teléfono para escalamientos urgentes. |
| `reference_type` | `text` | nullable | NULL | Si el ticket está ligado a una transacción: `'payout_request'`, `'payment_order'`, `'bridge_transfer'`. |
| `reference_id` | `uuid` | nullable | NULL | ID del objeto referenciado. |
| `priority` | `text` | NOT NULL, CHECK | `'normal'` | Prioridad: `'low'`, `'normal'`, `'high'`, `'urgent'`. |
| `status` | `text` | NOT NULL, CHECK | `'open'` | Estado: `'open'`, `'in_progress'`, `'waiting_client'`, `'resolved'`, `'closed'`. |
| `resolution_notes` | `text` | nullable | NULL | Notas de resolución escritas por el Staff al cerrar el ticket. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de apertura. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última actualización. |
| `resolved_at` | `timestamptz` | nullable | NULL | Fecha de resolución. |

*RLS: El cliente ve sus propios tickets. Staff ve y actualiza todos.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Asignado a:** `profiles` via `assigned_to`.
- **Referencia:** `payout_requests`, `payment_orders` o `bridge_transfers` via polimorfismo.

## Ejemplo JSON

```json
{
  "id": "tkt11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "assigned_to": "staff000-e89b-12d3-a456-426614174000",
  "subject": "Wire recibido en mi banco pero no aparece en plataforma",
  "message": "Envié un wire de $5,000 USD desde Chase hace 3 días y el banco confirma que salió, pero mi saldo en Guira sigue en $0.",
  "contact_email": "ceo@techcorp.com",
  "contact_phone": "+1 415-555-0100",
  "reference_type": "payment_order",
  "reference_id": "ord11111-e89b-12d3-a456-426614174000",
  "priority": "high",
  "status": "in_progress",
  "resolution_notes": null,
  "created_at": "2026-03-26T19:00:00Z",
  "updated_at": "2026-03-26T19:30:00Z",
  "resolved_at": null
}
```
