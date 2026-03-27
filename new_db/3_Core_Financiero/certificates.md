# Tabla: `public.certificates`

## Función de la Tabla
`certificates` almacena los comprobantes PDF de grado legal generados automáticamente cuando una transacción importante se completa (retiro, transferencia B2B). Estos certificados tienen valor probatorio ante terceros, aduanas, y entidades regulatorias. Se genera un hash criptográfico del contenido para garantizar que el PDF no fue alterado. Diseñado desde el MBV v1, adaptado para la nueva arquitectura.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del certificado. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente al que corresponde el comprobante. |
| `subject_type` | `text` | NOT NULL, CHECK | — | El evento que originó el certificado: `'payout_request'`, `'bridge_transfer'`, `'payment_order'`. |
| `subject_id` | `uuid` | NOT NULL | — | ID del evento origen. |
| `certificate_number` | `text` | UNIQUE, NOT NULL | — | Número de serie único del certificado (ej. `CERT-2026-00041`). Para referencia humana. |
| `pdf_storage_path` | `text` | NOT NULL | — | Ruta del PDF en Supabase Storage. |
| `content_hash` | `text` | NOT NULL | — | Hash SHA-256 del contenido del PDF. Garantiza integridad del documento. |
| `amount` | `numeric(20,6)` | NOT NULL | — | Monto de la transacción certificada. |
| `currency` | `text` | NOT NULL | — | Divisa de la transacción. |
| `issued_at` | `timestamptz` | NOT NULL | `now()` | Fecha de emisión del certificado. |
| `metadata` | `jsonb` | nullable | `'{}'` | Datos adicionales: número de referencia bancaria, SWIFT confirmación, etc. |

*RLS: El usuario solo descarga sus propios certificados. Staff y Admin ven todos.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Originado por:** `payout_requests`, `bridge_transfers`, `payment_orders` via polimorfismo.

## Ejemplo JSON

```json
{
  "id": "cer11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "subject_type": "payout_request",
  "subject_id": "pay11111-e89b-12d3-a456-426614174000",
  "certificate_number": "CERT-2026-00041",
  "pdf_storage_path": "certificates/123e4567/CERT-2026-00041.pdf",
  "content_hash": "a3f2d8c1e9b047f5a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4",
  "amount": 10000.00,
  "currency": "USD",
  "issued_at": "2026-03-26T18:01:00Z",
  "metadata": {
    "bank_reference": "WIRE-US-20260326-00041",
    "bridge_transfer_id": "trans_bridge_xyz"
  }
}
```
