# Tabla: `public.notifications`

## Función de la Tabla
`notifications` alimenta la **campana de notificaciones** en el header de la aplicación y puede servir para Push notifications móviles. El sistema inserta una notificación automáticamente cuando ocurre cualquier evento importante (depósito confirmado, retiro completado, expediente rechazado). El cliente puede marcarlas como leídas.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único de la notificación. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Destinatario de la notificación. |
| `type` | `text` | NOT NULL, CHECK | — | Categoría: `'financial'`, `'onboarding'`, `'compliance'`, `'system'`, `'support'`. |
| `title` | `text` | NOT NULL | — | Título corto y directo (ej. `'Depósito Confirmado'`). |
| `message` | `text` | NOT NULL | — | Texto descriptivo (máx. 255 chars para compatibilidad Push). |
| `link` | `text` | nullable | NULL | Ruta interna de la SPA (deep link) para llevar al usuario al contexto relevante. |
| `reference_type` | `text` | nullable | NULL | Tipo del objeto relacionado: `'payout_request'`, `'onboarding'`, `'bridge_transfer'`. |
| `reference_id` | `uuid` | nullable | NULL | ID del objeto para que el frontend lo identifique. |
| `is_read` | `boolean` | NOT NULL | `false` | Si el usuario ya vio (o descartó) la notificación. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Timestamp de creación. |
| `read_at` | `timestamptz` | nullable | NULL | Cuando el usuario la marcó como leída. |

*RLS: El usuario ve y actualiza (`is_read`) solo sus propias notificaciones.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.

## Ejemplo JSON

```json
{
  "id": "not11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "financial",
  "title": "Retiro Completado Exitosamente",
  "message": "Tu retiro de $10,000.00 USD fue enviado a Chase Bank (****4321). El dinero llegará en 1-2 días hábiles.",
  "link": "/dashboard/payouts/pay11111-e89b-12d3-a456-426614174000",
  "reference_type": "payout_request",
  "reference_id": "pay11111-e89b-12d3-a456-426614174000",
  "is_read": false,
  "created_at": "2026-03-26T18:01:00Z",
  "read_at": null
}
```
