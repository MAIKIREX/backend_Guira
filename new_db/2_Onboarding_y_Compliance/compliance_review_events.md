# Tabla: `public.compliance_review_events`

## Función de la Tabla
`compliance_review_events` guarda las **decisiones formales inmutables** emitidas por el Staff sobre un caso de revisión. Es el registro legal definitivo de cualquier aprobación o rechazo: quién lo hizo, cuándo y con qué justificación. Esta tabla **nunca permite UPDATE ni DELETE**, garantizando una cadena de evidencia inquebrantable.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del evento de decisión. |
| `review_id` | `uuid` | NOT NULL, FK → `compliance_reviews.id` | — | Caso sobre el que se tomó la decisión. |
| `actor_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Staff o Admin que emitió la decisión. |
| `decision` | `text` | NOT NULL, CHECK | — | Decisión tomada: `'APPROVED'`, `'REJECTED'`, `'NEEDS_CHANGES'`. |
| `reason` | `text` | NOT NULL | — | Justificación escrita obligatoria de la decisión. No puede estar vacío. |
| `metadata` | `jsonb` | nullable | `'{}'` | Datos adicionales: referencias a herramientas externas (Acuant, Jumio), IDs de verificación. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Timestamp exacto de la decisión (inmutable). |

*RLS: Solo `service_role` puede INSERT. Nadie puede UPDATE ni DELETE. Staff y Admin pueden SELECT.*

## Regla de Negocio Crítica
Cuando se inserta un evento `APPROVED`:
1. El backend actualiza `onboarding.status = 'verified'` y `profiles.onboarding_status = 'verified'`.
2. Se llama a Bridge API para registrar al customer y obtener el `bridge_customer_id`.
3. Se actualizan `compliance_reviews.status = 'closed'` y `closed_at = NOW()`.

## Relaciones
- **Pertenece a:** `compliance_reviews` via `review_id`.
- **Emitido por:** `profiles` via `actor_id`.

## Ejemplo JSON

```json
{
  "id": "evt11111-e89b-12d3-a456-426614174000",
  "review_id": "rev11111-e89b-12d3-a456-426614174000",
  "actor_id": "staff000-e89b-12d3-a456-426614174000",
  "decision": "APPROVED",
  "reason": "Todos los documentos verificados y válidos. Empresa registrada en California desde 2020. Directores sin antecedentes negativos en OFAC. KYB aprobado.",
  "metadata": {
    "verification_provider": "Jumio",
    "jumio_scan_id": "scn_abc123",
    "ofac_check": "clean"
  },
  "created_at": "2026-03-26T14:45:00Z"
}
```
