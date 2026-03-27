# Tabla: `public.people`

## Función de la Tabla
`people` almacena los datos personales detallados e inmutables de clientes individuales (personas naturales). Es la "ficha biográfica" completa del individuo: toda su información de identidad, contacto y domicilio necesaria para el proceso KYC. Esta tabla es el corazón del expediente de una persona fisica, separado del perfil de autenticación (`profiles`) para mantener la arquitectura limpia.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único de la persona. |
| `user_id` | `uuid` | UNIQUE, NOT NULL, FK → `profiles.id` | — | Usuario del sistema asociado. Relación 1:1 con profiles. |
| `first_name` | `text` | NOT NULL | — | Primer nombre legal. |
| `last_name` | `text` | NOT NULL | — | Apellido legal. |
| `date_of_birth` | `date` | NOT NULL | — | Fecha de nacimiento (requerida para verificación OFAC/AML). |
| `nationality` | `text` | NOT NULL | — | Código ISO-2 del país de nacionalidad (ej. `'US'`, `'BO'`, `'MX'`). |
| `country_of_residence` | `text` | NOT NULL | — | País de residencia actual. |
| `tax_id` | `text` | nullable | NULL | Número de identificación fiscal (SSN, NIT, CURP, CUIT según el país). |
| `id_type` | `text` | NOT NULL, CHECK | — | Tipo de documento: `'passport'`, `'national_id'`, `'drivers_license'`. |
| `id_number` | `text` | NOT NULL | — | Número del documento de identidad. |
| `id_expiry_date` | `date` | nullable | NULL | Fecha de vencimiento del documento (requerida por algunos proveedores). |
| `email` | `text` | NOT NULL | — | Email de contacto (puede ser diferente al de autenticación). |
| `phone` | `text` | NOT NULL | — | Teléfono con código de país (ej. `+1 415-555-0100`). |
| `address1` | `text` | NOT NULL | — | Dirección línea 1 (calle y número). |
| `address2` | `text` | nullable | NULL | Dirección línea 2 (apartamento, piso). |
| `city` | `text` | NOT NULL | — | Ciudad de residencia. |
| `state` | `text` | nullable | NULL | Estado o provincia. |
| `postal_code` | `text` | nullable | NULL | Código postal. |
| `country` | `text` | NOT NULL | — | País de residencia (código ISO-2). |
| `source_of_funds` | `text` | NOT NULL | — | Origen de los fondos declarado (ej. `'Salary'`, `'Business Revenue'`, `'Investments'`). |
| `account_purpose` | `text` | NOT NULL | — | Propósito de la cuenta en la plataforma (requerido para AML). |
| `is_pep` | `boolean` | NOT NULL | `false` | Si es Persona Expuesta Políticamente (Politically Exposed Person). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación del registro. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: El usuario solo puede ver su propia fila. Staff y Admin ven todas.*

## Relaciones
- **Extiende a:** `profiles` via `user_id` (relación 1:1).
- **Referenciada por:** `kyc_applications` via `person_id`.
- **Documentos:** `documents` apunta a `subject_type='person'` para adjuntar IDs y comprobantes.

## Ejemplo JSON

```json
{
  "id": "per11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "date_of_birth": "1990-01-01",
  "nationality": "US",
  "country_of_residence": "US",
  "tax_id": "123-45-6789",
  "id_type": "passport",
  "id_number": "P123456789",
  "id_expiry_date": "2030-01-01",
  "email": "ada@lovelace.com",
  "phone": "+1 415-555-0101",
  "address1": "923 Folsom Street, Apt 302",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94107",
  "country": "US",
  "source_of_funds": "Salary",
  "account_purpose": "International supplier payments",
  "is_pep": false,
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-01-15T10:00:00Z"
}
```
