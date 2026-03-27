# Flujo 01: Registro, Autenticación y Onboarding (KYC/KYB)

Este documento describe paso a paso cómo un nuevo cliente accede a la plataforma, desde la creación de su cuenta hasta quedar habilitado para operar financieramente.

---

## 🔐 FASE 1: Creación de Cuenta

### Tablas: `auth.users` (Supabase), `profiles`, `auth_rate_limits`

```
[Cliente] → POST /auth/signup (Email + Password) → Supabase Auth
    │
    └── Trigger AFTER INSERT ON auth.users
            └── INSERT INTO profiles (
                    id = auth.uid(),
                    email,
                    role = 'client',
                    onboarding_status = 'pending',
                    bridge_customer_id = NULL
                )
```

**Protección de fuerza bruta:**
- `auth_rate_limits` controla intentos por IP/email.
- Si `attempt_count >= 5` en 15 min → rechaza con `429`.

---

## 👤 FASE 2: KYC — Persona Natural

### Tablas: `people`, `kyc_applications`, `documents`

```
[Cliente Natural] → Navega al flujo KYC en la UI → Completa formulario
    │
    ├── INSERT INTO people (
    │       user_id,
    │       first_name, last_name,
    │       date_of_birth = '1990-01-01',
    │       nationality = 'US',
    │       country_of_residence = 'US',
    │       id_type = 'passport',
    │       id_number = 'P123456',
    │       email, phone,
    │       address1, city, state, country,
    │       source_of_funds = 'Salary',
    │       account_purpose = 'International payments'
    │   )
    │
    ├── INSERT INTO kyc_applications (
    │       user_id,
    │       person_id = people.id,
    │       status = 'DRAFT'
    │   )
    │
    └── [Sube pasaporte y comprobante de domicilio]
            └── INSERT INTO documents (
                    user_id, subject_type = 'person',
                    subject_id = people.id,
                    document_type = 'passport', ...
                )

[Cliente confirma ToS y envía expediente]
    └── UPDATE kyc_applications SET
            status = 'SUBMITTED',
            tos_accepted_at = NOW(),
            submitted_at = NOW()
```

---

## 🏢 FASE 3: KYB — Empresa

### Tablas: `businesses`, `business_directors`, `business_ubos`, `kyb_applications`, `documents`

```
[Cliente Corporativo] → Navega al flujo KYB

1. REGISTRO DE LA EMPRESA:
   INSERT INTO businesses (
       user_id, legal_name, trade_name,
       tax_id = '98-7654321', entity_type = 'LLC',
       country_of_incorporation = 'US',
       website, email, phone,
       address1, city, state, postal_code, country,
       business_description, business_industry,
       account_purpose, source_of_funds,
       operating_countries = ['US', 'MX'],
       conducts_money_services = false
   )

2. REGISTRO DE DIRECTORES (al menos el representante legal):
   INSERT INTO business_directors (
       business_id, first_name, last_name,
       position = 'CEO', is_signer = true,
       date_of_birth, nationality, id_type, id_number, ...
   )

3. REGISTRO DE UBOs (todos con >= 25% de propiedad):
   INSERT INTO business_ubos (
       business_id, first_name, last_name,
       ownership_percent = 60.00,
       date_of_birth, nationality, id_type, id_number, ...
   )

4. CREACIÓN DEL EXPEDIENTE KYB:
   INSERT INTO kyb_applications (
       business_id,
       requester_user_id = user.id,
       status = 'DRAFT'
   )

5. SUBIDA DE DOCUMENTOS (acta constitutiva, IDs de directores/UBOs):
   INSERT INTO documents (subject_type = 'business', subject_id = businesses.id, ...)
   INSERT INTO documents (subject_type = 'person', subject_id = business_directors.id, ...)

6. ENVÍO DEL EXPEDIENTE:
   UPDATE kyb_applications SET
       status = 'SUBMITTED',
       directors_complete = true,
       ubos_complete = true,
       documents_complete = true,
       tos_accepted_at = NOW(),
       submitted_at = NOW()
```

---

## 🔍 FASE 4: Revisión de Compliance (Staff)

### Tablas: `compliance_reviews`, `compliance_review_comments`, `compliance_review_events`

```
[Trigger] → Al cambiar kyc/kyb_applications.status = 'SUBMITTED':
    INSERT INTO compliance_reviews (
        subject_type = 'kyc_application' | 'kyb_application',
        subject_id = applications.id,
        status = 'open', priority = 'normal'
    )

[Staff] → Revisa en el backoffice
    ├── UPDATE compliance_reviews SET status = 'in_progress', assigned_to = staff_id
    ├── INSERT INTO compliance_review_comments (body = "Falta reverso del DNI...")
    └── INSERT INTO compliance_review_events (decision = 'APPROVED', reason = "...")

[Sistema] → Al detectar APPROVED:
    ├── UPDATE kyc/kyb_applications SET status = 'APPROVED', approved_at = NOW()
    ├── UPDATE profiles SET onboarding_status = 'verified'
    └── [Bridge API] → Registra el customer → UPDATE profiles SET bridge_customer_id = 'cust_...'
```

---

## ✅ FASE 5: Cliente Habilitado para Operar

Con `profiles.onboarding_status = 'verified'` y `profiles.bridge_customer_id IS NOT NULL`, el sistema automáticamente:

1. Crea las **wallets** crypto del cliente (`INSERT INTO wallets`).
2. Crea los registros de **balances** en `USD` y `USDC` (`INSERT INTO balances WHERE amount = 0`).
3. Provee una **Virtual Account** de Bridge para recibir transferencias bancarias.

---

## 📊 Estados KYC/KYB

| Estado | Significado |
|---|---|
| `DRAFT` | El cliente está llenando el formulario |
| `SUBMITTED` | Expediente enviado para revisión |
| `IN_REVIEW` | Staff revisando activamente |
| `NEEDS_CHANGES` | Devuelto al cliente para correcciones |
| `APPROVED` | Aprobado. Cliente habilitado |
| `REJECTED` | Rechazado definitivamente |
| `NEEDS_BRIDGE_KYC_LINK` | Bridge requiere verificación adicional |
