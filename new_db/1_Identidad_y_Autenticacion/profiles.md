# Tabla: `public.profiles`

## Función de la Tabla
`profiles` es la tabla central de la plataforma: el perfil de negocio de cada usuario autenticado en Supabase. Extiende `auth.users` con toda la información de roles, estado operacional y el vínculo con Bridge API (`bridge_customer_id`). **Ninguna operación financiera puede ocurrir sin que esta tabla valide que el usuario existe, tiene rol correcto y está verificado.**

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | — | Igual al `auth.users.id`. Clave raíz de toda la plataforma. |
| `email` | `text` | UNIQUE, NOT NULL | — | Email del usuario (copiado de Supabase Auth). |
| `full_name` | `text` | nullable | — | Nombre completo visible en la UI. |
| `role` | `text` | NOT NULL, CHECK | `'client'` | Rol del usuario: `client`, `staff`, `admin`. |
| `onboarding_status` | `text` | NOT NULL, CHECK | `'pending'` | Estado KYC/KYB: `pending`, `submitted`, `verified`, `rejected`, `needs_changes`. |
| `bridge_customer_id` | `text` | UNIQUE, nullable | NULL | ID del customer en Bridge API. Se asigna al aprobar el KYB. |
| `is_active` | `boolean` | NOT NULL | `true` | Si el usuario puede operar. Se pone en `false` para suspender la cuenta. |
| `is_frozen` | `boolean` | NOT NULL | `false` | Congelamiento por compliance (OFAC, investigación). Bloquea todas las transacciones mientras sea `true`. |
| `frozen_reason` | `text` | nullable | NULL | Razón del congelamiento (requerida cuando `is_frozen = true`). Ej. `'OFAC hit: nombre en lista SDN'`. |
| `frozen_at` | `timestamptz` | nullable | NULL | Fecha en que se congeló la cuenta. |
| `daily_limit_usd` | `numeric(20,2)` | NOT NULL | `10000` | Límite diario de transacciones en USD equivalente. Requerido por AML. |
| `monthly_limit_usd` | `numeric(20,2)` | NOT NULL | `50000` | Límite mensual acumulado de transacciones. Requerido por AML. |
| `phone` | `text` | nullable | — | Teléfono de contacto (para soporte y 2FA). |
| `avatar_url` | `text` | nullable | — | URL del avatar en Supabase Storage. |
| `metadata` | `jsonb` | nullable | `'{}'` | Datos auxiliares opcionales (preferencias UI, etc.). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de registro. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS habilitado: Los clientes solo ven su propia fila. Staff y Admin ven todas.*

## Relaciones
- **Creado automáticamente por:** Trigger en `auth.users` (INSERT).
- **Referenciado por:** `people`, `businesses`, `kyc_applications`, `kyb_applications`, `wallets`, `balances`, `payout_requests`, `bridge_virtual_accounts`, `bridge_external_accounts`, `bridge_transfers`, `compliance_reviews`, `audit_logs`, `activity_logs`, `notifications`, `support_tickets`.

## Ejemplo JSON

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "wilvelzap.ceo@techcorp.com",
  "full_name": "William Velazquez",
  "role": "client",
  "onboarding_status": "verified",
  "bridge_customer_id": "cust_bridge_abc123",
  "is_active": true,
  "is_frozen": false,
  "frozen_reason": null,
  "frozen_at": null,
  "daily_limit_usd": 10000.00,
  "monthly_limit_usd": 50000.00,
  "phone": "+1 415-555-0100",
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-03-26T09:30:00Z"
}
```
