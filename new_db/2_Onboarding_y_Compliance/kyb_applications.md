# Tabla: `public.kyb_applications`

## Función de la Tabla
`kyb_applications` es la solicitud formal de verificación **Know Your Business** para empresas. Reúne la entidad corporativa (`businesses`), sus directores (`business_directors`) y sus beneficiarios finales (`business_ubos`) en un expediente oficial que determina si la empresa puede operar financieramente en la plataforma. Esta tabla es el estado-semáforo del KYB: mientras `status ≠ 'APPROVED'`, la empresa no puede enviar ni recibir transferencias.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único de la solicitud KYB. |
| `business_id` | `uuid` | NOT NULL, FK → `businesses.id` | — | Empresa bajo verificación. |
| `requester_user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Usuario que creó este expediente en nombre de la empresa. |
| `status` | `text` | NOT NULL, CHECK | `'DRAFT'` | Estado: `'DRAFT'`, `'SUBMITTED'`, `'IN_REVIEW'`, `'NEEDS_CHANGES'`, `'APPROVED'`, `'REJECTED'`, `'NEEDS_BRIDGE_KYC_LINK'`. |
| `provider` | `text` | nullable | NULL | Proveedor de verificación: `'bridge'`, `'persona'`, `'manual'`. |
| `provider_id` | `text` | UNIQUE, nullable | NULL | ID del customer en Bridge API una vez aprobado. Vincula webhooks del proveedor. |
| `screening` | `jsonb` | nullable | NULL | Resultado del screening corporativo: listas OFAC, sanciones, PEPs en directores/UBOs. |
| `last_screened_at` | `timestamptz` | nullable | NULL | Última fecha de screening contra listas de sanciones. |
| `tos_accepted_at` | `timestamptz` | nullable | NULL | Cuando el representante legal aceptó los ToS en nombre de la empresa. |
| `tos_contract_id` | `text` | nullable | NULL | ID del contrato ToS aceptado. |
| `source` | `text` | NOT NULL | `'platform'` | Origen: `'platform'` o `'bridge_pull'`. |
| `observations` | `text` | nullable | NULL | Notas devueltas al cliente si status = `'NEEDS_CHANGES'`. |
| `directors_complete` | `boolean` | NOT NULL | `false` | Indicador de si todos los directores requeridos han sido registrados. |
| `ubos_complete` | `boolean` | NOT NULL | `false` | Indicador de si todos los UBOs relevantes han sido registrados. |
| `documents_complete` | `boolean` | NOT NULL | `false` | Indicador de si todos los documentos obligatorios han sido subidos. |
| `submitted_at` | `timestamptz` | nullable | NULL | Fecha de envio del expediente completo. |
| `approved_at` | `timestamptz` | nullable | NULL | Fecha de aprobación definitiva. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de inicio del trámite. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última actualización. |

*RLS: El cliente ve sus propias solicitudes KYB. Staff y Admin ven todas.*

## Relaciones
- **Apunta a:** `businesses` via `business_id`.
- **Iniciado por:** `profiles` via `requester_user_id`.
- **Revisado mediante:** `compliance_reviews` via `subject_type='kyb_application'`.
- **Una vez APPROVED:** Se actualiza `profiles.onboarding_status = 'verified'` y `profiles.bridge_customer_id = provider_id`.

## Estados y Transiciones

```
DRAFT → SUBMITTED → IN_REVIEW → APPROVED → (cliente puede operar)
                 ↘            → NEEDS_CHANGES → (cliente corrige) → SUBMITTED
                              → REJECTED
                              → NEEDS_BRIDGE_KYC_LINK → (Bridge pide enlace adicional)
```

## Ejemplo JSON

```json
{
  "id": "kyb11111-e89b-12d3-a456-426614174000",
  "business_id": "biz11111-e89b-12d3-a456-426614174000",
  "requester_user_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "APPROVED",
  "provider": "bridge",
  "provider_id": "cust_bridge_abc123",
  "screening": {
    "entity_hits": 0,
    "director_hits": 0,
    "ubo_hits": 0,
    "ofac_sanctions": false,
    "risk_score": "LOW"
  },
  "last_screened_at": "2026-01-17T10:00:00Z",
  "tos_accepted_at": "2026-01-16T08:00:00Z",
  "tos_contract_id": "tos_v2_2026",
  "source": "platform",
  "observations": null,
  "directors_complete": true,
  "ubos_complete": true,
  "documents_complete": true,
  "submitted_at": "2026-01-16T09:00:00Z",
  "approved_at": "2026-01-17T14:00:00Z",
  "created_at": "2026-01-15T09:00:00Z",
  "updated_at": "2026-01-17T14:00:00Z"
}
```
