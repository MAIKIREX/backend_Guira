# Tabla: `public.auth_rate_limits`

## Función de la Tabla
`auth_rate_limits` es la segunda capa de seguridad sobre el sistema de autenticación. Supabase maneja la autenticación básica, pero esta tabla permite al backend implementar lógica de negocio personalizada: bloquear IPs o emails que realizan demasiados intentos de login o de solicitud de OTP en un lapso corto. Vital para plataformas FinTech donde un acceso no autorizado puede significar pérdida de dinero real.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del registro de rate limit. |
| `identifier` | `text` | NOT NULL | — | El email o IP address que se está rastreando. |
| `identifier_type` | `text` | NOT NULL, CHECK | — | Tipo de identificador: `'email'` o `'ip_address'`. |
| `action` | `text` | NOT NULL | — | Acción que se está limitando: `'login'`, `'otp_request'`, `'password_reset'`. |
| `attempt_count` | `integer` | NOT NULL | `0` | Contador de intentos acumulados en la ventana temporal actual. |
| `first_attempt_at` | `timestamptz` | NOT NULL | `now()` | Inicio de la ventana de tiempo actual (para calcular el tiempo transcurrido). |
| `blocked_until` | `timestamptz` | nullable | NULL | Si está bloqueado, hasta cuándo. NULL = no bloqueado. |
| `last_attempt_at` | `timestamptz` | NOT NULL | `now()` | Timestamp del último intento registrado. |

*RLS: Solo el `service_role` (backend) puede leer y escribir en esta tabla. No es visible para clientes.*

## Lógica de Negocio

```
Regla: Si attempt_count >= 5 en los últimos 15 minutos:
    → SET blocked_until = NOW() + INTERVAL '30 minutes'
    → Responder 429 Too Many Requests al cliente
```

## Relaciones
No tiene FK directas. Es una tabla de control de infraestructura.

## Ejemplo JSON

```json
{
  "id": "aaa11111-e89b-12d3-a456-426614174000",
  "identifier": "attacker@malicious.com",
  "identifier_type": "email",
  "action": "otp_request",
  "attempt_count": 7,
  "first_attempt_at": "2026-03-26T10:00:00Z",
  "blocked_until": "2026-03-26T10:30:00Z",
  "last_attempt_at": "2026-03-26T10:14:55Z"
}
```
