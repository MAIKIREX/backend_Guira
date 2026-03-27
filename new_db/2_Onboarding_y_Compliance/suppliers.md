# Tabla: `public.suppliers`

## Función de la Tabla
`suppliers` almacena el directorio de proveedores pre-verificados de cada cliente. Cuando una empresa paga frecuentemente a la misma fábrica o proveedor en el extranjero, no necesita ingresar los datos bancarios cada vez. Un registro en `suppliers` representa a ese beneficiario recurrente, simplificando la creación de `payout_requests` futuras y añadiendo una capa de verificación previa de terceros.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del proveedor en la plataforma. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente propietario de este proveedor. |
| `name` | `text` | NOT NULL | — | Nombre legal o razón social del proveedor. |
| `country` | `text` | NOT NULL | — | País de origen del proveedor (código ISO 3166-1 alpha-2, ej. `'CN'`, `'US'`, `'DE'`). |
| `currency` | `text` | NOT NULL | — | Moneda en la que opera el proveedor (`'USD'`, `'EUR'`, `'CNY'`). |
| `payment_rail` | `text` | NOT NULL | — | Vía de pago preferida: `'wire'`, `'ach'`, `'sepa'`, `'swift'`. |
| `bank_details` | `jsonb` | NOT NULL | `'{}'` | Datos bancarios del proveedor: IBAN, routing, account, SWIFT/BIC, nombre del banco. |
| `contact_email` | `text` | nullable | NULL | Email de contacto del proveedor para enviarle comprobantes. |
| `is_verified` | `boolean` | NOT NULL | `false` | Si el Staff ya validó los datos bancarios del proveedor. |
| `is_active` | `boolean` | NOT NULL | `true` | Si el proveedor está activo para recibir pagos. |
| `notes` | `text` | nullable | NULL | Notas internas del cliente sobre este proveedor. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: El cliente solo ve sus propios proveedores. Staff y Admin ven todos.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Referenciado por:** `payout_requests` via `supplier_id` (como destino de un pago).
- **Documentos:** `documents` puede apuntar a `subject_type='supplier'` para guardar su verificación bancaria.

## Estructura del campo `bank_details`

```json
{
  "bank_name":       "Deutsche Bank",
  "swift_bic":       "DEUTDEDB",
  "iban":            "DE89370400440532013000",
  "account_name":    "Lieferant GmbH",
  "bank_country":    "DE",
  "bank_address":    "Taunusanlage 12, Frankfurt"
}
```

## Ejemplo JSON

```json
{
  "id": "sup11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Guangzhou Electronics Ltd",
  "country": "CN",
  "currency": "USD",
  "payment_rail": "swift",
  "bank_details": {
    "bank_name": "Bank of China",
    "swift_bic": "BKCHCNBJ",
    "account_number": "9988776655",
    "account_name": "Guangzhou Electronics Ltd"
  },
  "contact_email": "payments@gzelectronics.cn",
  "is_verified": true,
  "is_active": true,
  "notes": "Proveedor principal de componentes electrónicos.",
  "created_at": "2026-02-01T08:00:00Z",
  "updated_at": "2026-02-15T12:00:00Z"
}
```
