# Tabla: `public.documents`

## Función de la Tabla
`documents` almacena toda la evidencia documental de la plataforma: identificaciones personales, actas constitutivas, facturas de proveedores, comprobantes de domicilio, etc. Utiliza polimorfismo a través de `subject_type` y `subject_id` para asociarse a distintos objetos (onboardings, pagos, proveedores) sin necesitar múltiples tablas de join.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del documento. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Usuario que subió el documento. |
| `subject_type` | `text` | NOT NULL, CHECK | — | Tipo de entidad al que pertenece: `'onboarding'`, `'payout_request'`, `'supplier'`. |
| `subject_id` | `uuid` | NOT NULL | — | ID de la entidad indicada en `subject_type`. |
| `document_type` | `text` | NOT NULL | — | Clase de documento: `'passport'`, `'id_card'`, `'articles_of_incorporation'`, `'address_proof'`, `'invoice'`, `'other'`. |
| `description` | `text` | nullable | NULL | Descripción legible del documento (opcional). |
| `storage_path` | `text` | NOT NULL | — | Ruta del archivo en Supabase Storage (ej. `documents/user_id/filename.pdf`). |
| `file_name` | `text` | NOT NULL | — | Nombre original del archivo subido. |
| `mime_type` | `text` | NOT NULL | — | Tipo MIME: `'application/pdf'`, `'image/jpeg'`, `'image/png'`. |
| `file_size_bytes` | `bigint` | nullable | NULL | Tamaño del archivo en bytes. |
| `status` | `text` | NOT NULL, CHECK | `'pending_review'` | Estado de validación: `'pending_review'`, `'accepted'`, `'rejected'`. |
| `rejection_reason` | `text` | nullable | NULL | Motivo de rechazo si `status = 'rejected'`. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de carga. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

*RLS: El usuario ve sus propios documentos. Staff y Admin ven todos.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Referencia polimórfica a:** `onboarding`, `payout_requests`, `suppliers` via `subject_type + subject_id`.

## Ejemplo JSON

```json
{
  "id": "doc11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "subject_type": "onboarding",
  "subject_id": "111e4567-e89b-12d3-a456-426614174000",
  "document_type": "articles_of_incorporation",
  "description": "Acta constitutiva de Tech Corp SA",
  "storage_path": "documents/123e4567/acta_techcorp_2026.pdf",
  "file_name": "acta_techcorp_2026.pdf",
  "mime_type": "application/pdf",
  "file_size_bytes": 845231,
  "status": "accepted",
  "rejection_reason": null,
  "created_at": "2026-03-25T11:00:00Z",
  "updated_at": "2026-03-26T09:00:00Z"
}
```
