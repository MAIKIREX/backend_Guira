# Tabla: `public.bridge_external_accounts`

## Función de la Tabla
`bridge_external_accounts` almacena las cuentas bancarias externas de los clientes que han sido registradas en Bridge. Cuando un cliente quiere retirar fondos a su banco real, debe registrar esa cuenta en Bridge primero. Esta tabla es el caché local de esa información, permitiendo crear payout requests rápidamente sin consultar Bridge en cada paso.

**Referencia Bridge API:** `POST /v0/customers/{customer_id}/external_accounts`

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID interno de la cuenta externa. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente propietario. |
| `bridge_external_account_id` | `text` | UNIQUE, NOT NULL | — | ID provisto por Bridge (ej. `ext_acct_xyz123`). |
| `bridge_customer_id` | `text` | NOT NULL | — | Customer de Bridge al que pertenece. |
| `bank_name` | `text` | NOT NULL | — | Nombre del banco (ej. `'Chase Bank'`, `'Deutsche Bank'`). |
| `account_name` | `text` | NOT NULL | — | Nombre del titular de la cuenta bancaria. |
| `account_last_4` | `text` | NOT NULL | — | Últimos 4 dígitos de la cuenta (para display en UI). |
| `currency` | `text` | NOT NULL | — | Divisa de la cuenta (`'usd'`, `'eur'`). |
| `payment_rail` | `text` | NOT NULL | — | Vía que usa esta cuenta para recibir: `'ach'`, `'wire'`, `'sepa'`, `'swift'`. |
| `account_type` | `text` | nullable | NULL | Tipo de cuenta: `'checking'`, `'savings'` (para ACH en EE.UU.). |
| `routing_number` | `text` | nullable | NULL | Routing number (ACH/Wire en EE.UU.). |
| `iban` | `text` | nullable | NULL | IBAN si es cuenta europea. |
| `swift_bic` | `text` | nullable | NULL | SWIFT/BIC si es cuenta internacional. |
| `country` | `text` | NOT NULL | — | País de la cuenta (código ISO). |
| `is_active` | `boolean` | NOT NULL | `true` | Si la cuenta sigue vinculada y activa en Bridge. |
| `is_default` | `boolean` | NOT NULL | `false` | Si es la cuenta de retiro predeterminada del cliente. |
| `verified_at` | `timestamptz` | nullable | NULL | Fecha en que Bridge verificó la cuenta (via micro-depósitos o plaid). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de registro. |

*RLS: El cliente ve sus propias cuentas. Staff y Admin ven todas.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Referenciada por:** `payout_requests` como destino del retiro.

## Ejemplo JSON

```json
{
  "id": "bea11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "bridge_external_account_id": "ext_acct_xyz987abc",
  "bridge_customer_id": "cust_bridge_abc123",
  "bank_name": "Chase Bank",
  "account_name": "Tech Corp SA",
  "account_last_4": "4321",
  "currency": "usd",
  "payment_rail": "wire",
  "account_type": "checking",
  "routing_number": "026009593",
  "iban": null,
  "swift_bic": null,
  "country": "US",
  "is_active": true,
  "is_default": true,
  "verified_at": "2026-01-21T10:00:00Z",
  "created_at": "2026-01-20T14:00:00Z"
}
```
