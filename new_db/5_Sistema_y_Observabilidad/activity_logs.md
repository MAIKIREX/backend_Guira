# Tabla: `public.activity_logs`

## Función de la Tabla
`activity_logs` alimenta el **Feed de Actividad** visible para el cliente en la interfaz de usuario. Es la versión amigable del audit_log: en lugar de deltas técnicos de base de datos, contiene acciones en lenguaje natural que el cliente entiende ("Iniciaste sesión", "Solicitaste un retiro de $2,000 USD"). Aumenta la sensación de transparencia y control.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único del log de actividad. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Usuario que realizó la acción (o en cuyo nombre ocurrió). |
| `action` | `text` | NOT NULL | — | Código de acción estandarizado (ej. `'login_success'`, `'payout_requested'`, `'onboarding_submitted'`, `'document_uploaded'`). |
| `description` | `text` | nullable | NULL | Descripción legible para mostrar en la UI (puede incluir monto, divisa, banco destino). |
| `metadata` | `jsonb` | nullable | `'{}'` | Datos complementarios: monto, currency, IP, IDs relacionados. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Timestamp de la acción. |

*RLS: El usuario ve solo sus propios logs. Staff y Admin ven todos.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.

## Ejemplo JSON

```json
{
  "id": "act11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "action": "payout_requested",
  "description": "Solicitaste un retiro de $10,000.00 USD a tu cuenta Chase Bank (****4321).",
  "metadata": {
    "payout_request_id": "pay11111-e89b-12d3-a456-426614174000",
    "amount": 10000.00,
    "currency": "USD",
    "bank_last_4": "4321",
    "ip_address": "200.10.25.134"
  },
  "created_at": "2026-03-26T16:00:05Z"
}
```
