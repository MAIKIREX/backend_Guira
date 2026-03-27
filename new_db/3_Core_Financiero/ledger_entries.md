# Tabla: `public.ledger_entries`

## Función de la Tabla
`ledger_entries` es **la tabla más crítica de toda la plataforma**. Representa el libro mayor contable (General Ledger) donde cada fila es un movimiento financiero individual: depósito, retiro, comisión o ajuste. El saldo de cualquier wallet en cualquier momento es simplemente `SUM(amount)` de sus entradas con `status = 'settled'`. Esta arquitectura de Event Sourcing garantiza la integridad financiera total ante auditorías externas, reguladores y disputas de clientes.

**Principio fundamental: Esta tabla JAMÁS hace UPDATE de montos. Solo INSERT.**

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | Identificador único del movimiento. |
| `wallet_id` | `uuid` | NOT NULL, FK → `wallets.id` | — | Wallet afectada por este movimiento. |
| `type` | `text` | NOT NULL, CHECK | — | Tipo: `'deposit'`, `'withdrawal'`, `'fee'`, `'adjustment'`, `'reversal'`. |
| `amount` | `numeric(20,6)` | NOT NULL | — | Monto del movimiento. **Positivo = crédito. Negativo = débito.** CHECK: no puede ser 0. |
| `currency` | `text` | NOT NULL | — | Divisa del movimiento (debe coincidir con la wallet). |
| `status` | `text` | NOT NULL, CHECK | `'settled'` | Estado: `'pending'`, `'settled'`, `'reversed'`. |
| `reference_type` | `text` | nullable | NULL | Tipo del objeto origen: `'payment_order'`, `'payout_request'`, `'bridge_transfer'`, `'manual_adjustment'`. |
| `reference_id` | `uuid` | nullable | NULL | ID del objeto origen en su tabla correspondiente. |
| `bridge_transfer_id` | `uuid` | nullable, FK → `bridge_transfers.id` | NULL | Vínculo directo a la transferencia de Bridge que generó este movimiento. |
| `description` | `text` | NOT NULL | — | Texto descriptivo legible: `'Wire recibido desde Chase Bank'`, `'Fee de retiro ACH'`. |
| `metadata` | `jsonb` | nullable | `'{}'` | Datos auxiliares como tipo de cambio aplicado, IDs de idempotencia, etc. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Timestamp del movimiento (inmutable). |

*RLS: El usuario ve solo las entradas de sus wallets. Staff y Admin ven todas. NADIE puede UPDATE ni DELETE.*

## Tipos de Entry y Signos

| `type` | `amount` | Cuándo se crea |
|---|---|---|
| `deposit` | Positivo (+) | Cuando llega un Wire, ACH o pago cripto |
| `withdrawal` | Negativo (-) | Cuando se envía dinero a cuenta externa |
| `fee` | Negativo (-) | Comisión de la plataforma o de Bridge |
| `adjustment` | + o - | Corrección manual hecha por Admin con justificación |
| `reversal` | Positivo (+) | Devolución de un retiro fallido o disputado |

## Relaciones
- **Pertenece a:** `wallets` via `wallet_id`.
- **Originada por:** `payment_orders`, `payout_requests`, `bridge_transfers` via polimorfismo (`reference_type + reference_id`).

## Ejemplo JSON

```json
{
  "id": "led11111-e89b-12d3-a456-426614174000",
  "wallet_id": "wal11111-e89b-12d3-a456-426614174000",
  "type": "deposit",
  "amount": 5000.00,
  "currency": "USD",
  "status": "settled",
  "reference_type": "payment_order",
  "reference_id": "ord11111-e89b-12d3-a456-426614174000",
  "bridge_transfer_id": null,
  "description": "Wire recibido via Bridge Virtual Account — Lead Bank ACH",
  "metadata": { "bridge_event_id": "evt_abc123", "sender_name": "Tech Corp SA" },
  "created_at": "2026-03-26T15:30:00Z"
}
```
