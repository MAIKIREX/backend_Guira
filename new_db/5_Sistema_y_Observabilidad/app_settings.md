# Tabla: `public.app_settings`

## Función de la Tabla
`app_settings` es un módulo de configuración Key-Value que permite al Admin ajustar el comportamiento de la plataforma en tiempo real, sin redeploys ni cambios en el código. Sirve para Feature Flags (habilitar/deshabilitar funcionalidades), límites operacionales (montos mínimos/máximos), mensajes globales de mantenimiento, y configuraciones de entorno que deben ser modificables desde el backoffice sin intervención de ingeniería.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `key` | `text` (PK) | NOT NULL, UNIQUE | — | Identificador alfanumérico con guiones bajos (ej. `'MIN_PAYOUT_USD'`). Usado por el backend como variable de configuración. |
| `value` | `text` | NOT NULL | — | El valor actual de la configuración (siempre como texto; el backend parsea el tipo). |
| `type` | `text` | NOT NULL, CHECK | `'string'` | Tipo del valor: `'string'`, `'number'`, `'boolean'`, `'json'`. Ayuda al frontend a parsear correctamente. |
| `description` | `text` | NOT NULL | — | Explicación clara de qué controla esta variable. Obligatorio para mantenibilidad. |
| `is_public` | `boolean` | NOT NULL | `false` | Si es `true`, el frontend del cliente puede leer este valor (ej. mensajes de mantenimiento). Si es `false`, solo backend/admin. |
| `updated_by` | `uuid` | nullable, FK → `profiles.id` | NULL | Admin que hizo el último cambio. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Fecha de la última modificación. |

*RLS: Solo Admin puede INSERT/UPDATE. Backend con `service_role` puede SELECT todo. Si `is_public = true`, el cliente puede leer.*

## Settings de Ejemplo

| `key` | `value` | `type` | Efecto |
|---|---|---|---|
| `MIN_PAYOUT_USD` | `50.00` | `number` | Monto mínimo de retiro en USD |
| `MAX_PAYOUT_USD` | `100000.00` | `number` | Monto máximo de retiro diario en USD |
| `PAYOUT_REVIEW_THRESHOLD` | `5000.00` | `number` | Retiros mayores a este monto requieren revisión de Compliance |
| `MAINTENANCE_MODE` | `false` | `boolean` | Bloquea todas las transacciones en la plataforma |
| `BRIDGE_ENVIRONMENT` | `production` | `string` | `'production'` o `'sandbox'` de Bridge API |
| `KYB_AUTO_APPROVE_TEST` | `false` | `boolean` | Solo para entornos de prueba. Auto-aprueba KYBs. NUNCA en producción. |
| `BANNER_MESSAGE` | `` | `string` | Mensaje de banner visible en el portal del cliente |
| `SUPPORTED_CURRENCIES` | `["USD","USDC","EUR"]` | `json` | Divisas habilitadas en la plataforma |
| `DEFAULT_DEVELOPER_FEE_PERCENT` | `1.0` | `number` | Fee por defecto enviado a Bridge en las Virtual Accounts |

## Relaciones
No tiene FK dependientes. Es una tabla global singleton de configuración.

## Ejemplo JSON

```json
{
  "key": "PAYOUT_REVIEW_THRESHOLD",
  "value": "5000.00",
  "type": "number",
  "description": "Retiros que superen este monto en USD serán encolados automáticamente para revisión manual del equipo de Compliance antes de enviarse a Bridge.",
  "is_public": false,
  "updated_by": "admin000-e89b-12d3-a456-426614174000",
  "updated_at": "2026-03-01T00:00:00Z"
}
```
