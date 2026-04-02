# Fase 1 — Migración de Base de Datos

> **Prioridad:** 🔴 ALTA — Debe ejecutarse PRIMERO antes de cualquier cambio en backend  
> **Impacto:** 3 tablas (1 ALTER + 2 CREATE) + seed data + RLS policies

---

## 1.1 ALTER TABLE `payment_orders`

### Columnas a AGREGAR (26 columnas nuevas)

```sql
-- =============================================
-- MIGRACIÓN: payment_orders — extensión completa
-- =============================================

-- 1. Clasificación del flujo
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS flow_type text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS flow_category text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS requires_psav boolean NOT NULL DEFAULT false;

-- 2. Source — campos adicionales
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS source_address text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS source_network text;

-- 3. Destination — campos completos
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_type text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_currency text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS external_account_id uuid;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_bank_name text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_account_number text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_account_holder text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_qr_url text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_address text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS destination_network text;

-- 4. Montos adicionales
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS amount_destination numeric(18,2);

-- 5. PSAV / Admin
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS psav_deposit_instructions jsonb;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS deposit_proof_url text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS exchange_rate_applied numeric(12,6);

-- 6. Bridge integration
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS bridge_transfer_id text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS bridge_source_deposit_instructions jsonb;

-- 7. Tracking
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS tx_hash text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider_reference text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS receipt_url text;

-- 8. Metadatos adicionales
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS business_purpose text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS supporting_document_url text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
```

### Modificar CHECK constraint de `status`

```sql
-- Eliminar CHECK existente
ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;

-- Nuevo CHECK con estados extendidos
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN (
    'created',
    'waiting_deposit',
    'deposit_received',
    'processing',
    'sent',
    'completed',
    'failed',
    'cancelled',
    'pending',       -- mantener backward compatibility con órdenes existentes
    'refunded'       -- mantener backward compatibility
  ));
```

> ⚠️ **Nota:** Se mantienen `pending` y `refunded` para backward compatibility con las órdenes creadas por el flujo de webhooks actual. Los nuevos flujos usarán `created` como estado inicial en vez de `pending`.

### Agregar CHECK constraint para `flow_type`

```sql
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_flow_type_check
  CHECK (flow_type IS NULL OR flow_type IN (
    'bolivia_to_world',
    'wallet_to_wallet',
    'bolivia_to_wallet',
    'world_to_bolivia',
    'world_to_wallet',
    'fiat_bo_to_bridge_wallet',
    'crypto_to_bridge_wallet',
    'fiat_us_to_bridge_wallet',
    'bridge_wallet_to_fiat_bo',
    'bridge_wallet_to_crypto',
    'bridge_wallet_to_fiat_us'
  ));
```

> `IS NULL` permite que las órdenes creadas por el webhook handler existente (que no tiene flow_type) sigan funcionando.

### Agregar CHECK para `flow_category`

```sql
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_flow_category_check
  CHECK (flow_category IS NULL OR flow_category IN ('interbank', 'wallet_ramp'));
```

### Foreign Keys nuevas

```sql
-- FK al usuario que aprobó
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id);

-- FK a la cuenta externa destino
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_external_account_id_fkey
  FOREIGN KEY (external_account_id) REFERENCES bridge_external_accounts(id);
```

### Índices para performance

```sql
-- Búsquedas frecuentes del admin
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_flow_type ON payment_orders(flow_type);
CREATE INDEX IF NOT EXISTS idx_payment_orders_requires_psav ON payment_orders(requires_psav) WHERE requires_psav = true;
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON payment_orders(user_id, created_at DESC);
```

### Trigger updated_at

```sql
-- Función genérica (puede existir ya)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger en payment_orders
DROP TRIGGER IF EXISTS trg_payment_orders_updated_at ON payment_orders;
CREATE TRIGGER trg_payment_orders_updated_at
  BEFORE UPDATE ON payment_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

---

## 1.2 CREATE TABLE `psav_accounts`

```sql
CREATE TABLE IF NOT EXISTS public.psav_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('bank_bo', 'bank_us', 'crypto')),
  currency text NOT NULL,
  bank_name text,
  account_number text,
  account_holder text,
  qr_url text,
  crypto_address text,
  crypto_network text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE psav_accounts ENABLE ROW LEVEL SECURITY;

-- Solo staff/admin puede ver y gestionar
CREATE POLICY "staff_and_admin_full_access" ON psav_accounts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('staff', 'admin', 'super_admin')
    )
  );

-- Los clientes NO pueden ver esta tabla directamente.
-- El backend les devuelve los datos necesarios al crear una orden.

-- Trigger updated_at
CREATE TRIGGER trg_psav_accounts_updated_at
  BEFORE UPDATE ON psav_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE psav_accounts IS 'Cuentas bancarias y wallets crypto del PSAV (intermediario) que se muestran al usuario para depósitos en flujos mediados.';
```

### Seed data para `psav_accounts`

```sql
-- Ejemplo: Cuenta BOB del PSAV
INSERT INTO psav_accounts (name, type, currency, bank_name, account_number, account_holder)
VALUES (
  'PSAV Bolivia - BNB',
  'bank_bo',
  'BOB',
  'Banco Nacional de Bolivia',
  '0000000000',   -- Reemplazar con datos reales
  'Nombre del PSAV'
);

-- Ejemplo: Wallet crypto del PSAV
INSERT INTO psav_accounts (name, type, currency, crypto_address, crypto_network)
VALUES (
  'PSAV Crypto - USDC Ethereum',
  'crypto',
  'USDC',
  '0x0000000000000000000000000000000000000000',  -- Reemplazar
  'ethereum'
);
```

---

## 1.3 CREATE TABLE `exchange_rates_config`

```sql
CREATE TABLE IF NOT EXISTS public.exchange_rates_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair text NOT NULL UNIQUE,  -- 'BOB_USD', 'USD_BOB', etc.
  rate numeric(12,6) NOT NULL,
  spread_percent numeric(5,2) DEFAULT 0,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE exchange_rates_config ENABLE ROW LEVEL SECURITY;

-- Admin puede gestionar
CREATE POLICY "admin_full_access" ON exchange_rates_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Lectura pública para consulta de tipos de cambio
CREATE POLICY "public_read" ON exchange_rates_config
  FOR SELECT
  USING (true);

COMMENT ON TABLE exchange_rates_config IS 'Tipos de cambio configurables por admin. Se usan en flujos PSAV donde la conversión es manual.';
```

### Seed data

```sql
INSERT INTO exchange_rates_config (pair, rate, spread_percent) VALUES
  ('BOB_USD', 0.1449, 1.50),   -- 1 BOB ≈ 0.1449 USD (tc oficial: 6.90)
  ('USD_BOB', 6.90, 1.50),     -- 1 USD ≈ 6.90 BOB
  ('BOB_USDC', 0.1449, 1.50),  -- Equivalente a BOB_USD para crypto
  ('USDC_BOB', 6.90, 1.50);    -- Equivalente a USD_BOB para crypto
```

---

## 1.4 INSERT nuevos `fees_config`

```sql
-- Fees para flujos interbancarios PSAV
INSERT INTO fees_config (operation_type, payment_rail, currency, fee_type, fee_percent, fee_fixed, min_fee, max_fee, is_active, description)
VALUES
  ('interbank_bo_out', 'psav', 'bob', 'mixed', 1.50, 5.00, 10.00, NULL, true,
   'Bolivia → Exterior (mediado PSAV)'),
  ('interbank_bo_in', 'psav', 'usd', 'mixed', 1.00, 5.00, 10.00, NULL, true,
   'Exterior → Bolivia (mediado PSAV)'),
  ('interbank_w2w', 'bridge', 'usdt', 'percent', 0.50, NULL, 2.00, NULL, true,
   'Wallet crypto → Wallet crypto (Bridge Transfer)'),
  ('interbank_bo_wallet', 'psav', 'bob', 'mixed', 1.50, 5.00, 10.00, NULL, true,
   'Bolivia → Wallet externa crypto (PSAV)');

-- Fees para rampas de acceso/salida
INSERT INTO fees_config (operation_type, payment_rail, currency, fee_type, fee_percent, fee_fixed, min_fee, max_fee, is_active, description)
VALUES
  ('ramp_on_bo', 'psav', 'bob', 'mixed', 1.50, 3.00, 8.00, NULL, true,
   'Fiat(BO) → Wallet Bridge (PSAV)'),
  ('ramp_on_crypto', 'bridge', 'usdt', 'percent', 0.50, NULL, 1.00, NULL, true,
   'Crypto → Wallet Bridge (Bridge Transfer)'),
  ('ramp_on_fiat_us', 'bridge', 'usd', 'percent', 0.25, NULL, 1.00, NULL, true,
   'Fiat(US) → Wallet Bridge (Virtual Account)'),
  ('ramp_off_bo', 'psav', 'usdc', 'mixed', 1.50, 3.00, 8.00, NULL, true,
   'Wallet Bridge → Fiat(BO) (PSAV)'),
  ('ramp_off_crypto', 'bridge', 'usdc', 'percent', 0.50, NULL, 1.00, NULL, true,
   'Wallet Bridge → Crypto (Bridge Transfer)'),
  ('ramp_off_fiat_us', 'bridge', 'usdc', 'percent', 0.75, NULL, 5.00, 500.00, true,
   'Wallet Bridge → Fiat(US) (Bridge Transfer)');
```

---

## 1.5 Nuevos `app_settings`

```sql
INSERT INTO app_settings (key, value, type, description, is_public)
VALUES
  ('MAX_PAYMENT_ORDERS_PER_HOUR', '5', 'number',
   'Máximo de órdenes de pago por hora por usuario', false),
  ('MIN_INTERBANK_USD', '10.00', 'number',
   'Monto mínimo en USD para movimientos interbancarios', true),
  ('MAX_INTERBANK_USD', '50000.00', 'number',
   'Monto máximo en USD para movimientos interbancarios', true),
  ('MIN_RAMP_USD', '5.00', 'number',
   'Monto mínimo en USD para rampas on/off', true),
  ('MAX_RAMP_USD', '25000.00', 'number',
   'Monto máximo en USD para rampas on/off', true),
  ('PSAV_REVIEW_THRESHOLD', '1000.00', 'number',
   'Monto desde el cual órdenes PSAV requieren revisión extra de compliance', false);
```

---

## 1.6 RLS adicional para `payment_orders`

```sql
-- Actualizar políticas existentes si es necesario:
-- El usuario solo ve sus propias órdenes
-- El admin ve todas las órdenes

-- Verificar si ya existen políticas y ajustar si es necesario
-- (Las políticas existentes deberían cubrir esto con la columna user_id)
```

---

## ✅ Checklist de Verificación Post-Migración

```sql
-- 1. Verificar columnas nuevas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payment_orders'
ORDER BY ordinal_position;

-- 2. Verificar constraints
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE 'payment_orders%';

-- 3. Verificar tablas nuevas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('psav_accounts', 'exchange_rates_config');

-- 4. Verificar fees_config nuevos
SELECT operation_type, payment_rail FROM fees_config
WHERE operation_type LIKE 'interbank%' OR operation_type LIKE 'ramp%';

-- 5. Verificar RLS está habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('psav_accounts', 'exchange_rates_config');
```
