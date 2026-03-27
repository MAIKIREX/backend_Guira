# Tabla: `public.wallets`

## Función de la Tabla
`wallets` almacena las **wallets crypto creadas por Bridge** (o custodios similares) y asignadas a un cliente. A diferencia del modelo anterior donde la wallet era un contenedor numérico, aquí una wallet es una dirección blockchain real provista por un proveedor custodio (Bridge, Fireblocks). La wallet tiene una `address` pública en una red específica, puede recibir fondos crypto on-chain, y el proveedor custodia la clave privada. El saldo visible al usuario siempre se consulta desde la tabla `balances`.

**Relación con Bridge API:** Las wallets pueden vincularse al concepto de "Bridge Wallet" (`/v0/bridge-wallets`) que Bridge usa como source en transferencias cripto, o bien ser generadas por el custodio de la plataforma. El campo `provider_wallet_id` guarda el ID de Bridge para referencia en transferencias.

## Columnas

| Nombre | Tipo | Restricciones | Default | Descripción |
|---|---|---|---|---|
| `id` | `uuid` (PK) | NOT NULL | `uuid_generate_v4()` | ID único interno de la wallet en la plataforma. |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` | — | Propietario lógico de la wallet. |
| `currency` | `text` | NOT NULL, CHECK | — | Criptomoneda que gestiona esta wallet: `'USDC'`, `'USDT'`, `'ETH'`, `'SOL'`. |
| `address` | `text` | NOT NULL | — | Dirección pública blockchain (ej. `0x3f5CE5...`). Donde llegan los fondos on-chain. |
| `network` | `text` | NOT NULL | — | Blockchain / Layer: `'ethereum'`, `'polygon'`, `'solana'`, `'base'`, `'stellar'`. |
| `provider_key` | `text` | NOT NULL | — | Quien generó y custodia la clave privada: `'bridge'`, `'fireblocks'`, `'internal'`. |
| `provider_wallet_id` | `text` | UNIQUE, nullable | NULL | ID del objeto wallet en el proveedor (ej. Bridge wallet ID `bwallet_xxx`). Usado como `source` en Bridge Transfers. |
| `label` | `text` | nullable | NULL | Etiqueta descriptiva en la UI (ej. `'Wallet USDC Principal'`). |
| `is_active` | `boolean` | NOT NULL | `true` | Si la wallet puede recibir fondos. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Fecha de asignación de la wallet al usuario. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Última modificación. |

**UNIQUE CONSTRAINT:** `(user_id, currency, network)` — Un usuario tiene una wallet por combinación de moneda y red.

*RLS: El cliente ve solo sus propias wallets. Staff y Admin ven todas.*

## Relaciones
- **Pertenece a:** `profiles` via `user_id`.
- **Tiene saldo en:** `balances` (la wallet es referenciada indirectamente por currency y user_id).
- **Usada como source en:** `bridge_transfers` via `provider_wallet_id`.

## Ejemplo JSON

```json
{
  "id": "wal11111-e89b-12d3-a456-426614174000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "currency": "USDC",
  "address": "0x3f5CE5FBFe3E9af3971dD833D26BA9b5C936f0bE",
  "network": "ethereum",
  "provider_key": "bridge",
  "provider_wallet_id": "bwallet_guira_main_abc123",
  "label": "Wallet USDC Principal",
  "is_active": true,
  "created_at": "2026-01-16T10:00:00Z",
  "updated_at": "2026-01-16T10:00:00Z"
}
```
