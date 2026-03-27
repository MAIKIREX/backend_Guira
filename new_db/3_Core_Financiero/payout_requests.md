# Tabla: `public.payout_requests`

## Función de la Tabla
`payout_requests` representa cada solicitud de retiro del cliente: mover dinero desde su wallet de la plataforma hacia una cuenta bancaria externa real. Cada payout pasa por verificación de saldo, cálculo de comisiones, revisión de compliance (si supera el umbral), y finalmente se ejecuta via Bridge API. El resultado se refleja como un `ledger_entry` de tipo `withdrawal`.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del retiro. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Cliente que solicita el retiro. |
| `wallet_id` | `uuid` | NOT NULL, FK → `wallets.id` | — | Wallet de donde se debitarán los fondos. |
| `bridge_external_account_id` | `uuid` | nullable, FK → `bridge_external_accounts.id` | NULL | Cuenta bancaria destino registrada en Bridge. |
| `supplier_id` | `uuid` | nullable, FK → `suppliers.id` | NULL | Si el pago es a un proveedor pre-registrado. |
| `payment_rail` | `text` | NOT NULL | — | Vía de envío: `'ach'`, `'wire'`, `'sepa'`, `'swift'`, `'crypto'`. |
| `amount` | `numeric(20,6)` | NOT NULL, CHECK > 0 | — | Monto bruto solicitado. |
| `fee_amount` | `numeric(20,6)` | NOT NULL | `0` | Tarifa aplicada. |
| `net_amount` | `numeric(20,6)` | NOT NULL | — | Monto real que recibirá el beneficiario. |
| `currency` | `text` | NOT NULL | — | Divisa del retiro. |
| `status` | `text` | NOT NULL, CHECK | `'pending_review'` | Estado: `'pending_review'`, `'approved'`, `'processing'`, `'completed'`, `'failed'`, `'cancelled'`. |
| `idempotency_key` | `text` | UNIQUE, NOT NULL | — | Clave única para prevenir doble ejecución via Bridge. |
| `bridge_transfer_id` | `uuid` | nullable, FK → `bridge_transfers.id` | NULL | Transfer de Bridge que ejecutó este payout. |
| `business_purpose` | `text` | NOT NULL | — | Razón comercial del pago (requerida por AML). |
| `notes` | `text` | nullable | NULL | Notas adicionales del cliente. |
| `documents_required` | `boolean` | NOT NULL | `false` | Si se requieren documentos soporte (facturas). |
| `completed_at` | `timestamptz` | nullable | NULL | Fecha de envío confirmado. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de solicitud. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última actualización de estado. |

*RLS: El cliente ve y crea sus propios retiros. Staff aprueba/rechaza. Admin ve todos.*

## Relaciones
- **Pertenece a:** `profiles`, `wallets`.
- **Destino:** `bridge_external_accounts` o `suppliers`.
- **Ejecutado via:** `bridge_transfers`.
- **Genera:** `ledger_entries` (withdrawal + fee).
- **Documentos soporte:** `documents` via `subject_type='payout_request'`.
- **Revisión:** `compliance_reviews` via `subject_type='payout_request'` si supera el umbral.

## Ejemplo JSON

```json
{
  "id": "pay11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "wallet_id": "wal11111-e89b-12d3-a456-426614174000",
  "bridge_external_account_id": "ext11111-e89b-12d3-a456-426614174000",
  "supplier_id": null,
  "payment_rail": "wire",
  "amount": 10000.00,
  "fee_amount": 25.00,
  "net_amount": 9975.00,
  "currency": "USD",
  "status": "completed",
  "idempotency_key": "idm_pay11111_20260326",
  "bridge_transfer_id": "btr11111-e89b-12d3-a456-426614174000",
  "business_purpose": "Pago a proveedor de manufactura en Asia (Factura #INV-2026-041)",
  "documents_required": true,
  "completed_at": "2026-03-26T18:00:00Z",
  "created_at": "2026-03-26T16:00:00Z",
  "updated_at": "2026-03-26T18:00:00Z"
}
```
