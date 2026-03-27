# Tabla: `public.business_directors`

## Función de la Tabla
`business_directors` enlista a los miembros de la Junta Directiva y representantes legales de cada empresa registrada en la plataforma. Es un requisito de cumplimiento internacional (AML/KYB): se debe identificar quiénes tienen poder de firma y control legal sobre la empresa. Bridge API y reguladores como FinCEN exigen estos datos para aprobar una cuenta empresarial. Cada director debe ser sometido a screening OFAC individual.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único del registro de director. |
| `business_id` | `uuid` | NOT NULL, FK → `businesses.id` | — | Empresa a la que pertenece este director. |
| `first_name` | `text` | NOT NULL | — | Nombre legal del director. |
| `last_name` | `text` | NOT NULL | — | Apellido legal. |
| `position` | `text` | NOT NULL | — | Cargo formal: `'CEO'`, `'CFO'`, `'COO'`, `'Board Member'`, `'General Manager'`, `'Legal Representative'`. |
| `is_signer` | `boolean` | NOT NULL | `false` | Si esta persona tiene poder de firma legal sobre la empresa. Los signers requieren mayor escrutinio. |
| `date_of_birth` | `date` | NOT NULL | — | Fecha de nacimiento (obligatoria para screening OFAC). |
| `nationality` | `text` | NOT NULL | — | Código ISO-2 del país de nacionalidad. |
| `country_of_residence` | `text` | NOT NULL | — | País de residencia actual. |
| `id_type` | `text` | NOT NULL, CHECK | — | Tipo de documento: `'passport'`, `'national_id'`, `'drivers_license'`. |
| `id_number` | `text` | NOT NULL | — | Número del documento de identidad. |
| `id_expiry_date` | `date` | nullable | NULL | Fecha de vencimiento del documento. |
| `email` | `text` | nullable | NULL | Email de contacto del director. |
| `phone` | `text` | nullable | NULL | Teléfono de contacto con código de país. |
| `address1` | `text` | nullable | NULL | Dirección de residencia del director. |
| `city` | `text` | nullable | NULL | Ciudad de residencia. |
| `country` | `text` | nullable | NULL | País de residencia (código ISO-2). |
| `document_id` | `uuid` | nullable, FK → `documents.id` | NULL | Referencia al documento de identidad validado subido en `documents`. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: El cliente ve solo los directores de sus empresas. Staff y Admin ven todos.*

## Relaciones
- **Pertenece a:** `businesses` via `business_id`.
- **Tiene documento:** `documents` via `document_id`.

## Ejemplo JSON

```json
{
  "id": "dir11111-e89b-12d3-a456-426614174000",
  "business_id": "biz11111-e89b-12d3-a456-426614174000",
  "first_name": "William",
  "last_name": "Velazquez",
  "position": "CEO",
  "is_signer": true,
  "date_of_birth": "1985-03-15",
  "nationality": "US",
  "country_of_residence": "US",
  "id_type": "passport",
  "id_number": "P987654321",
  "id_expiry_date": "2032-03-15",
  "email": "w.velazquez@techcorp.com",
  "phone": "+1 415-555-0100",
  "address1": "923 Folsom St, Apt 302",
  "city": "San Francisco",
  "country": "US",
  "document_id": "doc11111-e89b-12d3-a456-426614174000",
  "created_at": "2026-01-15T09:30:00Z",
  "updated_at": "2026-01-15T09:30:00Z"
}
```
