# Tabla: `public.bridge_kyc_links`

## Función de la Tabla
`bridge_kyc_links` guarda los links de verificación de identidad generados por Bridge para que los clientes completen su KYC de forma interactiva. Bridge ofrece la posibilidad de generar un link que el usuario abre en su navegador para completar el proceso de verificación sin necesidad de que la plataforma maneje directamente los datos del documento. Este flujo es complementario al KYC estructurado interno (`kyc_applications`).

**Referencia Bridge API:** `POST /v0/kyc_links`

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID interno del link. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Usuario al que se le generó el link. |
| `kyc_application_id` | `uuid` | nullable, FK → `kyc_applications.id` | NULL | Solicitud KYC asociada (si existe). |
| `bridge_kyc_link_id` | `text` | UNIQUE, NOT NULL | — | ID del KYC Link en Bridge. |
| `link_url` | `text` | NOT NULL | — | URL que el cliente debe abrir para completar su verificación interactiva. |
| `type` | `text` | NOT NULL, CHECK | `'individual'` | Tipo de verificación: `'individual'` (KYC persona) o `'business'` (KYC empresa). |
| `status` | `text` | NOT NULL, CHECK | `'pending'` | Estado: `'pending'` (sin completar), `'approved'`, `'rejected'`, `'expired'`. |
| `bridge_customer_id` | `text` | nullable | NULL | Customer ID asignado por Bridge si el link fue aprobado. Se copia a `profiles.bridge_customer_id`. |
| `expires_at` | `timestamptz` | nullable | NULL | Fecha de expiración del link (Bridge los expira tras un período). |
| `completed_at` | `timestamptz` | nullable | NULL | Cuando el usuario completó el formulario en Bridge. |
| `approved_at` | `timestamptz` | nullable | NULL | Cuando Bridge aprobó la verificación. |
| `rejection_reason` | `text` | nullable | NULL | Razón del rechazo si `status = 'rejected'`. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de creación. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última actualización (se actualiza via webhook `kyc_link.approved/rejected`). |

*RLS: El cliente ve su propio link. Staff y Admin ven todos.*

## Flujo de Uso

```
[Backend] → POST /v0/kyc_links → Bridge genera link
    → INSERT INTO bridge_kyc_links (link_url, status='pending', expires_at)
    → [Correo al cliente con link_url]

[Cliente] → Abre link_url en navegador → Completa formulario en página de Bridge
    → Bridge envía webhook: 'kyc_link.approved'
    → webhook_events → CRON procesa →
        ├── UPDATE bridge_kyc_links SET status='approved', bridge_customer_id='cust_xxx'
        ├── UPDATE profiles SET bridge_customer_id='cust_xxx', onboarding_status='verified'
        └── UPDATE kyc_applications SET status='APPROVED', provider_id='cust_xxx'
```

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Relacionado con:** `kyc_applications` via `kyc_application_id`.
- **Actualizado por:** `webhook_events` al recibir `kyc_link.approved` o `kyc_link.rejected`.

## Ejemplo JSON

```json
{
  "id": "klnk1111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "kyc_application_id": "kyc11111-e89b-12d3-a456-426614174000",
  "bridge_kyc_link_id": "kyc_link_abc12345",
  "link_url": "https://kyc.bridge.xyz/verify/kyc_link_abc12345",
  "type": "individual",
  "status": "approved",
  "bridge_customer_id": "cust_bridge_abc123",
  "expires_at": "2026-04-05T12:00:00Z",
  "completed_at": "2026-03-26T11:30:00Z",
  "approved_at": "2026-03-26T12:00:00Z",
  "rejection_reason": null,
  "created_at": "2026-03-26T10:00:00Z",
  "updated_at": "2026-03-26T12:00:00Z"
}
```
