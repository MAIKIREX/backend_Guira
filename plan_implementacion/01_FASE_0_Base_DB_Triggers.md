# FASE 0 — Base: Triggers PostgreSQL, Seed Data y RLS Verification
> **Duración estimada:** 1-2 días  
> **Prioridad:** 🔴 BLOQUEANTE — Sin esto, todas las demás fases fallarán silenciosamente

---

## ¿Por qué esta fase es critica?

Actualmente las 35 tablas están creadas en Supabase, pero **falta toda la lógica de base de datos** que hace funcionar el modelo:
- Sin triggers `AFTER INSERT ON ledger_entries` → los `balances` nunca se actualizan
- Sin trigger `AFTER INSERT ON auth.users` → los `profiles` no se crean automáticamente
- Sin RLS policies correctas → los endpoints retornan vacío aunque haya datos

Esta fase establece la base sobre la que todo lo demás opera.

---

## 📋 CHECKLIST DE ESTA FASE

- [ ] T0.1 — Trigger: auto-crear `profiles` al registrar usuario en auth.users
- [ ] T0.2 — Trigger: actualizar `balances` al insertar en `ledger_entries`
- [ ] T0.3 — Trigger: crear `compliance_review` al cambiar KYC/KYB a 'SUBMITTED'
- [ ] T0.4 — Trigger: escribir `audit_logs` en mutaciones de tablas sensibles
- [ ] T0.5 — Trigger: bloquear UPDATE/DELETE en `compliance_review_events` (inmutabilidad)
- [ ] T0.6 — Trigger: bloquear UPDATE/DELETE en `audit_logs` (inmutabilidad)
- [ ] T0.7 — RLS: verificar todas las policies en tablas de `profiles` (lectura propia)
- [ ] T0.8 — RLS: policies para `compliance_reviews` (solo Staff/Admin puede ver todo)
- [ ] T0.9 — Seed: insertar `fees_config` defaults
- [ ] T0.10 — Seed: insertar `app_settings` defaults
- [ ] T0.11 — Seed: insertar `payin_routes` defaults
- [ ] T0.12 — Verificar que las políticas RLS de `ledger_entries` permiten INSERT desde service_role
- [ ] T0.13 — Crear función PostgreSQL `get_user_balance(user_id, currency)` helper
- [ ] T0.14 — Test de integración básico: crear usuario → perfil creado → balance inicializado

---

## 🔧 IMPLEMENTACIÓN DETALLADA

### T0.1 — Trigger: Auto-crear Perfil

```sql
-- Migration: 20260328_01_trigger_auto_profile.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, onboarding_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'client',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### T0.2 — Trigger: Actualizar Balances desde Ledger

```sql
-- Migration: 20260328_02_trigger_balance_update.sql
CREATE OR REPLACE FUNCTION public.update_balance_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_delta   numeric;
BEGIN
  -- Obtener user_id desde la wallet
  SELECT user_id INTO v_user_id FROM public.wallets WHERE id = NEW.wallet_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Calcular delta (credit = positivo, debit = negativo)
  v_delta := CASE WHEN NEW.type = 'credit' THEN NEW.amount ELSE -NEW.amount END;

  -- Solo si el entry está 'settled'
  IF NEW.status = 'settled' THEN
    INSERT INTO public.balances (user_id, currency, amount, available_amount)
    VALUES (v_user_id, NEW.currency, v_delta, v_delta)
    ON CONFLICT (user_id, currency) DO UPDATE
    SET
      amount           = balances.amount           + v_delta,
      available_amount = balances.available_amount + v_delta,
      updated_at       = NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER after_ledger_entry_insert
  AFTER INSERT ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_balance_from_ledger();
```

### T0.3 — Trigger: Crear Compliance Review al Submittir KYC/KYB

```sql
-- Migration: 20260328_03_trigger_compliance_review.sql
CREATE OR REPLACE FUNCTION public.create_compliance_review_on_submit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Solo actuar en transición a SUBMITTED
  IF NEW.status = 'SUBMITTED' AND (OLD.status IS NULL OR OLD.status <> 'SUBMITTED') THEN
    INSERT INTO public.compliance_reviews (
      subject_type, subject_id, status, priority
    )
    VALUES (
      TG_TABLE_NAME::text, -- 'kyc_applications' o 'kyb_applications'
      NEW.id,
      'open',
      'normal'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_kyc_submitted
  AFTER UPDATE ON public.kyc_applications
  FOR EACH ROW EXECUTE FUNCTION public.create_compliance_review_on_submit();

CREATE TRIGGER on_kyb_submitted
  AFTER UPDATE ON public.kyb_applications
  FOR EACH ROW EXECUTE FUNCTION public.create_compliance_review_on_submit();
```

### T0.4 — Trigger: Inmutabilidad de compliance_review_events y audit_logs

```sql
-- Migration: 20260328_04_trigger_immutability.sql
CREATE OR REPLACE FUNCTION public.prevent_updates()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Esta tabla es inmutable — no se permiten UPDATE ni DELETE (tabla: %)', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

CREATE TRIGGER immutable_compliance_review_events
  BEFORE UPDATE OR DELETE ON public.compliance_review_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_updates();

CREATE TRIGGER immutable_audit_logs
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_updates();
```

### T0.5 — Trigger: Audit Log automático en tablas sensibles

```sql
-- Migration: 20260328_05_trigger_audit.sql
CREATE OR REPLACE FUNCTION public.audit_sensitive_tables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    performed_by, role, action, table_name,
    record_id, previous_values, new_values, source
  )
  VALUES (
    auth.uid(),
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    TG_OP,
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
    'backend'
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar a tablas críticas
CREATE TRIGGER audit_profiles
  AFTER UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_tables();

CREATE TRIGGER audit_kyc_applications
  AFTER UPDATE ON public.kyc_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_tables();
```

---

## 🌱 SEED DATA REQUERIDO

### fees_config (Tarifas por defecto)
```sql
INSERT INTO public.fees_config (operation_type, payment_rail, currency, fee_type, fee_percent, fee_fixed, min_fee, max_fee)
VALUES
  ('deposit',    'wire',  'usd', 'percent', 1.0,  NULL, 5.00,   NULL),
  ('deposit',    'ach',   'usd', 'percent', 0.5,  NULL, 1.00,   NULL),
  ('payout',     'wire',  'usd', 'percent', 0.75, NULL, 10.00,  500.00),
  ('payout',     'ach',   'usd', 'percent', 0.25, NULL, 1.00,   NULL),
  ('payout',     'sepa',  'eur', 'percent', 0.5,  NULL, 2.00,   NULL);
```

### app_settings (Feature flags)
```sql
INSERT INTO public.app_settings (key, value, type, description, is_public)
VALUES
  ('MIN_PAYOUT_USD',              '50.00',       'number',  'Monto mínimo de retiro', true),
  ('MAX_PAYOUT_USD',              '100000.00',   'number',  'Monto máximo de retiro', true),
  ('PAYOUT_REVIEW_THRESHOLD',     '5000.00',     'number',  'Umbral para revisión de compliance', false),
  ('MAINTENANCE_MODE',            'false',       'boolean', 'Bloquea nuevas transacciones', true),
  ('BRIDGE_ENVIRONMENT',          'production',  'string',  'Entorno Bridge API', false),
  ('DEFAULT_DEVELOPER_FEE_PCT',   '1.0',         'number',  'Fee por defecto en Virtual Accounts', false),
  ('SUPPORTED_CURRENCIES',        '["USD","USDC","EUR"]', 'json', 'Divisas activas', true);
```

### payin_routes (Rutas de entrada)
```sql
INSERT INTO public.payin_routes (name, payment_rail, currency, is_active, fee_type, fee_value)
VALUES
  ('Wire USD',  'wire', 'usd', true, 'percent', 1.0),
  ('ACH USD',   'ach',  'usd', true, 'percent', 0.5),
  ('SEPA EUR',  'sepa', 'eur', true, 'percent', 0.5),
  ('SPEI MXN',  'spei', 'mxn', true, 'fixed',   5.0);
```

---

## 🔒 RLS POLICIES A VERIFICAR

### Tabla: profiles
```sql
-- Clientes ven solo su propio perfil
CREATE POLICY "client_read_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Service role puede leer todo
CREATE POLICY "service_role_all" ON profiles
  FOR ALL USING (auth.role() = 'service_role');

-- Staff/Admin pueden leer todo
CREATE POLICY "staff_read_all" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'admin', 'super_admin'))
  );
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

1. Al crear un usuario vía Supabase Auth → se crea automáticamente un registro en `profiles`
2. Al insertar un `ledger_entry` con `status = 'settled'` → el balance del usuario se actualiza
3. Al cambiar `kyc_applications.status = 'SUBMITTED'` → se crea un `compliance_review`
4. Intentar UPDATE en `audit_logs` → lanza excepción
5. Los seeds están insertados y consultables vía API

---

## 🔗 SIGUIENTE FASE

Con los triggers y seeds listos → **[FASE 1: Auth e Identidad](./02_FASE_1_Auth_e_Identidad.md)**
