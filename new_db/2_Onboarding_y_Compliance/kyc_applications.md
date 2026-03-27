# Tabla: `public.kyc_applications`

## Función de la Tabla
`kyc_applications` representa la solicitud formal de verificación de identidad (**Know Your Customer**) para personas naturales. Es el expediente oficial que reúne los datos biográficos del individuo (`people`) y determina su estado de aprobación para operar en la plataforma. Esta tabla es el semáforo: mientras `status ≠ 'APPROVED'`, el cliente no puede transaccionar.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único de la solicitud KYC. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Usuario que solicita verificación. |
| `person_id` | `uuid` | NOT NULL, FK → `people.id` | — | Datos biográficos del individuo bajo revisión. |
| `status` | `text` | NOT NULL, CHECK | `'DRAFT'` | Estado: `'DRAFT'`, `'SUBMITTED'`, `'IN_REVIEW'`, `'NEEDS_CHANGES'`, `'APPROVED'`, `'REJECTED'`. |
| `provider` | `text` | nullable | NULL | Proveedor de verificación: `'bridge'`, `'persona'`, `'veriff'`, `'manual'`. |
| `provider_id` | `text` | UNIQUE, nullable | NULL | ID del cliente en el proveedor externo (ej. `bridge_customer_id`). Usado para vincular webhooks. |
| `screening` | `jsonb` | nullable | NULL | Resultado del screening de listas de sanciones: OFAC, PEPs, blacklists. |
| `last_screened_at` | `timestamptz` | nullable | NULL | Última vez que se corrió el screening contra listas de sanciones. |
| `tos_accepted_at` | `timestamptz` | nullable | NULL | Cuando el usuario aceptó los Términos de Servicio. |
| `tos_contract_id` | `text` | nullable | NULL | ID del contrato ToS aceptado (versión firmada). |
| `source` | `text` | NOT NULL | `'platform'` | Origen del expediente: `'platform'` (UI del cliente) o `'bridge_pull'` (sincronizado desde Bridge). |
| `observations` | `text` | nullable | NULL | Notas del Staff para el cliente si el status es `'NEEDS_CHANGES'`. |
| `submitted_at` | `timestamptz` | nullable | NULL | Fecha en que el cliente envió el expediente. |
| `approved_at` | `timestamptz` | nullable | NULL | Fecha de aprobación definitiva. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última actualización. |

*RLS: El cliente ve su propio KYC. Staff y Admin ven todos.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Datos biográficos en:** `people` via `person_id`.
- **Revisado mediante:** `compliance_reviews` via `subject_type='kyc_application'`.

## Ejemplo JSON

```json
{
  "id": "kyc11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "person_id": "per11111-e89b-12d3-a456-426614174000",
  "status": "APPROVED",
  "provider": "bridge",
  "provider_id": "cust_bridge_abc123",
  "screening": {
    "pep_hits": 0,
    "ofac_sanctions": false,
    "risk_score": "LOW",
    "checked_at": "2026-01-16T12:00:00Z"
  },
  "last_screened_at": "2026-01-16T12:00:00Z",
  "tos_accepted_at": "2026-01-15T10:05:00Z",
  "tos_contract_id": "tos_v2_2026",
  "source": "platform",
  "observations": null,
  "submitted_at": "2026-01-15T10:10:00Z",
  "approved_at": "2026-01-16T14:30:00Z",
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-01-16T14:30:00Z"
}
```
