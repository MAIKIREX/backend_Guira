# Tabla: `public.business_ubos`

## Función de la Tabla
`business_ubos` registra a los **Beneficiarios Finales (Ultimate Beneficial Owners)** de cada empresa. Por normativa AML/CFT internacional, toda persona física que posea directa o indirectamente más del **25%** de la empresa debe ser identificada, documentada y sometida a screening OFAC. Bridge API exige esta información para completar el KYB corporativo. Esta tabla es uno de los componentes más críticos del compliance a nivel institucional.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único del UBO. |
| `business_id` | `uuid` | NOT NULL, FK → `businesses.id` | — | Empresa de la cual esta persona es beneficiaria. |
| `first_name` | `text` | NOT NULL | — | Nombre legal del UBO. |
| `last_name` | `text` | NOT NULL | — | Apellido legal. |
| `date_of_birth` | `date` | NOT NULL | — | Fecha de nacimiento (obligatoria para screening OFAC). |
| `nationality` | `text` | NOT NULL | — | País de nacionalidad (ISO-2). |
| `country_of_residence` | `text` | NOT NULL | — | País de residencia actual. |
| `ownership_percent` | `numeric(5,2)` | NOT NULL, CHECK >= 25 | — | Porcentaje de propiedad sobre la empresa. Mínimo reportable: 25%. |
| `id_type` | `text` | NOT NULL, CHECK | — | Tipo de documento: `'passport'`, `'national_id'`, `'drivers_license'`. |
| `id_number` | `text` | NOT NULL | — | Número del documento de identidad. |
| `id_expiry_date` | `date` | nullable | NULL | Fecha de vencimiento del documento. |
| `tax_id` | `text` | nullable | NULL | Identificación fiscal personal del UBO (SSN, NIT, etc.). |
| `email` | `text` | nullable | NULL | Email de contacto del UBO. |
| `phone` | `text` | nullable | NULL | Teléfono de contacto. |
| `address1` | `text` | NOT NULL | — | Dirección de residencia. |
| `address2` | `text` | nullable | NULL | Dirección línea 2. |
| `city` | `text` | NOT NULL | — | Ciudad de residencia. |
| `state` | `text` | nullable | NULL | Estado o provincia. |
| `postal_code` | `text` | nullable | NULL | Código postal. |
| `country` | `text` | NOT NULL | — | País de residencia (código ISO-2). |
| `is_pep` | `boolean` | NOT NULL | `false` | Si es Persona Expuesta Políticamente. |
| `document_id` | `uuid` | nullable, FK → `documents.id` | NULL | Referencia al documento de identidad validado en `documents`. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de registro. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: El cliente ve solo los UBOs de sus empresas. Staff y Admin ven todos.*

## Relaciones
- **Pertenece a:** `businesses` via `business_id`.
- **Tiene documento:** `documents` via `document_id`.

## Ejemplo JSON

```json
{
  "id": "ubo11111-e89b-12d3-a456-426614174000",
  "business_id": "biz11111-e89b-12d3-a456-426614174000",
  "first_name": "María",
  "last_name": "Hernández",
  "date_of_birth": "1978-11-20",
  "nationality": "MX",
  "country_of_residence": "US",
  "ownership_percent": 60.00,
  "id_type": "passport",
  "id_number": "G12345678",
  "id_expiry_date": "2029-11-20",
  "tax_id": "456-78-9012",
  "email": "m.hernandez@techcorp.com",
  "phone": "+1 415-555-0102",
  "address1": "456 Mission St",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94105",
  "country": "US",
  "is_pep": false,
  "document_id": "doc22222-e89b-12d3-a456-426614174000",
  "created_at": "2026-01-15T09:45:00Z",
  "updated_at": "2026-01-15T09:45:00Z"
}
```
