# Tabla: `public.businesses`

## Función de la Tabla
`businesses` es la tabla central del dominio corporativo. Almacena la identidad legal, datos operativos y bancarios de las empresas clientes de Guira. Solo pueden operar financieramente una vez completan y aprueban un proceso `kyb_applications`. Contiene los campos de compliance AML requeridos por Bridge y reguladores internacionales para permitir pagos cross-border.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único de la entidad empresarial. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente (perfil) propietario que registró la empresa. |
| `legal_name` | `text` | NOT NULL | — | Razón social formal (ej. `'Tech Corp SA de CV'`). |
| `trade_name` | `text` | nullable | NULL | Nombre comercial o DBA (Doing Business As). |
| `registration_number` | `text` | nullable | NULL | Matrícula de comercio o número de registro empresarial local. |
| `tax_id` | `text` | nullable | NULL | NIT, EIN, RFC u otro identificador fiscal según el país. |
| `entity_type` | `text` | NOT NULL | — | Forma jurídica: `'LLC'`, `'C_CORP'`, `'S_CORP'`, `'SRL'`, `'SA'`, `'LTDA'`, `'OTHER'`. |
| `incorporation_date` | `date` | nullable | NULL | Fecha de constitución legal de la empresa. |
| `country_of_incorporation` | `text` | NOT NULL | — | País donde fue registrada (código ISO-2). |
| `state_of_incorporation` | `text` | nullable | NULL | Estado o provincia de incorporación (si aplica). |
| `operating_countries` | `text[]` | nullable | NULL | Países donde la empresa opera o factura (para análisis de riesgo). |
| `website` | `text` | nullable | NULL | URL web oficial. |
| `email` | `text` | NOT NULL | — | Email institucional de contacto. |
| `phone` | `text` | NOT NULL | — | Teléfono corporativo con código de país. |
| `address1` | `text` | NOT NULL | — | Dirección del domicilio fiscal (calle y número). |
| `address2` | `text` | nullable | NULL | Dirección línea 2. |
| `city` | `text` | NOT NULL | — | Ciudad de la sede. |
| `state` | `text` | nullable | NULL | Estado o provincia. |
| `postal_code` | `text` | nullable | NULL | Código postal. |
| `country` | `text` | NOT NULL | — | País de la sede fiscal (código ISO-2). |
| `business_description` | `text` | NOT NULL | — | Descripción del giro de negocio. Requerida por AML para entender la actividad económica. |
| `business_industry` | `text` | NOT NULL | — | Industria o sector (ej. `'Technology'`, `'Agriculture'`, `'Manufacturing'`). |
| `account_purpose` | `text` | NOT NULL | — | Para qué usará la cuenta en Guira (ej. `'Supplier payments'`, `'International payroll'`). |
| `source_of_funds` | `text` | NOT NULL | — | Origen de los fondos empresariales (ej. `'Revenue from exports'`, `'Investment capital'`). |
| `conducts_money_services` | `boolean` | NOT NULL | `false` | Si la empresa en sí es un MSB (Money Services Business). Activa alertas de compliance adicionales. |
| `uses_bridge_for_money_services` | `boolean` | NOT NULL | `false` | Si planea usar Bridge para prestar servicios financieros a terceros. Requiere aprobación adicional. |
| `compliance_explanation` | `text` | nullable | NULL | Explicación si alguna de las banderas de riesgo anteriores está activa. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de registro. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: El cliente ve solo su(s) empresa(s). Staff y Admin ven todas.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Referenciada por:** `kyb_applications`, `business_directors`, `business_ubos`.
- **Documentos:** `documents` apunta a `subject_type='business'`.

## Ejemplo JSON

```json
{
  "id": "biz11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "legal_name": "Tech Corp SA de CV",
  "trade_name": "TechCorp",
  "registration_number": "12345678-01",
  "tax_id": "98-7654321",
  "entity_type": "LLC",
  "incorporation_date": "2020-05-15",
  "country_of_incorporation": "US",
  "state_of_incorporation": "CA",
  "operating_countries": ["US", "MX", "CN"],
  "website": "https://techcorp.com",
  "email": "legal@techcorp.com",
  "phone": "+1 415-555-0100",
  "address1": "123 Market St",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94105",
  "country": "US",
  "business_description": "Software development and international technology consulting.",
  "business_industry": "Technology",
  "account_purpose": "International supplier payments and payroll",
  "source_of_funds": "Revenue from software contracts",
  "conducts_money_services": false,
  "uses_bridge_for_money_services": false,
  "created_at": "2026-01-15T09:00:00Z",
  "updated_at": "2026-01-15T09:00:00Z"
}
```
