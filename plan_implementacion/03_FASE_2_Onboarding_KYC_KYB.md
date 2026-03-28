# FASE 2 — Onboarding KYC / KYB
> **Duración estimada:** 4-5 días  
> **Dependencias:** Fase 1 completada (Auth + Profiles funcionando)  
> **Módulo NestJS:** `onboarding/` (nuevo) + Storage Supabase

---

## Objetivo

Implementar el flujo completo de verificación de identidad:
- **KYC** para personas naturales (`people` → `kyc_applications` → documentos)
- **KYB** para empresas (`businesses` → `business_directors` → `business_ubos` → `kyb_applications` → documentos)

El flujo termina cuando el Staff aprueba el expediente y el sistema registra al cliente en Bridge API.

---

## 📋 CHECKLIST DE ESTA FASE

### KYC — Persona Natural
- [ ] F2.1 — `POST /onboarding/kyc/person` — crea o actualiza `people` con datos biográficos
- [ ] F2.2 — `GET /onboarding/kyc/person` — obtiene datos actuales de `people`
- [ ] F2.3 — `POST /onboarding/kyc/application` — crea `kyc_application` vinculada a `person`
- [ ] F2.4 — `PATCH /onboarding/kyc/application/submit` — envía expediente (status = SUBMITTED)
- [ ] F2.5 — `GET /onboarding/kyc/application` — estado del expediente KYC
- [ ] F2.6 — `POST /onboarding/kyc/tos-accept` — registra aceptación de ToS con timestamp

### Documentos / Storage
- [ ] F2.7 — `POST /onboarding/documents/upload` — sube documento a Supabase Storage y crea `documents`
- [ ] F2.8 — `GET /onboarding/documents` — lista documentos del usuario
- [ ] F2.9 — `GET /onboarding/documents/:id/signed-url` — URL temporal para descargar documento
- [ ] F2.10 — Validación: solo mime types permitidos (pdf, jpg, jpeg, png). Max 10MB

### KYB — Empresa
- [ ] F2.11 — `POST /onboarding/kyb/business` — crea / actualiza datos de `businesses`
- [ ] F2.12 — `GET /onboarding/kyb/business` — obtiene datos de la empresa
- [ ] F2.13 — `POST /onboarding/kyb/business/directors` — añade director a `business_directors`
- [ ] F2.14 — `DELETE /onboarding/kyb/business/directors/:id` — elimina director
- [ ] F2.15 — `POST /onboarding/kyb/business/ubos` — añade UBO a `business_ubos`
- [ ] F2.16 — `DELETE /onboarding/kyb/business/ubos/:id` — elimina UBO
- [ ] F2.17 — `POST /onboarding/kyb/application` — crea `kyb_application`
- [ ] F2.18 — `PATCH /onboarding/kyb/application/submit` — envía expediente KYB (status = SUBMITTED)
- [ ] F2.19 — `GET /onboarding/kyb/application` — estado del expediente KYB

### Bridge KYC Link (Verificación delegada)
- [ ] F2.20 — `POST /onboarding/bridge-kyc-link` — crea KYC link en Bridge para verificación delegada
- [ ] F2.21 — `GET /onboarding/bridge-kyc-link` — estado del KYC link activo

### Post-Aprobación (llamado por Worker / Admin)
- [ ] F2.22 — `registerCustomerInBridge(userId)` — servicio interno: crea customer en Bridge API
- [ ] F2.23 — Al recibir `bridge_customer_id` → actualizar `profiles`
- [ ] F2.24 — Inicializar wallets y balances del cliente aprobado

---

## 🏗️ ARQUITECTURA DEL MÓDULO

```
src/application/onboarding/
├── onboarding.module.ts
├── onboarding.controller.ts      ← routes KYC, KYB, documentos
├── onboarding.service.ts         ← lógica de negocio
├── bridge-customer.service.ts    ← llamadas a Bridge para crear/verificar customer
└── dto/
    ├── create-person.dto.ts
    ├── create-business.dto.ts
    ├── create-director.dto.ts
    ├── create-ubo.dto.ts
    ├── submit-kyc.dto.ts
    ├── submit-kyb.dto.ts
    └── upload-document.dto.ts
```

---

## 🔑 ENDPOINTS DETALLADOS

### KYC Flow (Persona Natural)

```
Flujo frontend → backend:

PASO 1: Datos personales
  POST /onboarding/kyc/person
  Body: { first_name, last_name, date_of_birth, nationality, country_of_residence,
          id_type, id_number, id_expiry_date, email, phone,
          address1, city, state, country,
          source_of_funds, account_purpose, is_pep }
  → INSERT/UPDATE en `people`

PASO 2: Subida de documentos
  POST /onboarding/documents/upload
  Body: FormData { file, document_type: 'passport', subject_type: 'person' }
  → Supabase Storage: kyc-docs/{user_id}/{timestamp}_{filename}
  → INSERT en `documents`

PASO 3: Crear aplicación KYC
  POST /onboarding/kyc/application
  → INSERT en `kyc_applications` { user_id, person_id, status: 'pending' }

PASO 4: Aceptar ToS
  POST /onboarding/kyc/tos-accept
  → UPDATE kyc_applications SET tos_accepted_at = NOW()

PASO 5: Enviar expediente
  PATCH /onboarding/kyc/application/submit
  → Validar que documents existen para el person
  → UPDATE kyc_applications SET status = 'SUBMITTED', submitted_at = NOW()
  → Trigger de DB crea compliance_review automáticamente
  → Notificación al Staff (INSERT notifications para admin)
```

### KYB Flow (Empresa)

```
PASO 1: Datos empresa
  POST /onboarding/kyb/business
  Body: { legal_name, trade_name, tax_id, entity_type,
          incorporation_date, country_of_incorporation,
          website, email, phone, address1, city, state, country,
          business_description, business_industry,
          account_purpose, source_of_funds,
          conducts_money_services, operating_countries }

PASO 2: Directores
  POST /onboarding/kyb/business/directors
  Body: { first_name, last_name, position, is_signer,
          date_of_birth, nationality, id_type, id_number }

PASO 3: UBOs (Beneficiarios Finales ≥ 25%)
  POST /onboarding/kyb/business/ubos
  Body: { first_name, last_name, ownership_percent,
          date_of_birth, nationality, id_type, id_number, is_pep }

PASO 4: Documentos empresa + directores/UBOs
  POST /onboarding/documents/upload
  Body: { file, document_type: 'incorporation_certificate', subject_type: 'business', subject_id: business_id }

PASO 5: Envío
  PATCH /onboarding/kyb/application/submit
  → Valida directors_complete, ubos_complete, documents_complete
  → UPDATE kyb_applications SET status = 'SUBMITTED'
  → Trigger crea compliance_review
```

---

## 📁 SUPABASE STORAGE — Política de Buckets

```
Bucket: "kyc-documents"
  - Acceso: PRIVADO (solo service_role puede leer)
  - RLS: client puede escribir en kyc-documents/{user_id}/*
  - Solo Admin/Staff puede leer cualquier ruta

Path convention:
  kyc-documents/{user_id}/{yyyy-mm-dd}_{document_type}_{uuid}.{ext}
  
Ej:
  kyc-documents/abc-123/2026-03-28_passport_uuid.pdf
  kyc-documents/abc-123/2026-03-28_proof_of_address_uuid.jpg
```

```typescript
// Supabase Storage upload
const { data, error } = await this.supabase.storage
  .from('kyc-documents')
  .upload(`${userId}/${filename}`, fileBuffer, {
    contentType: mimeType,
    upsert: false,
  });

// Generar URL firmada para descarga (válida 1 hora)
const { data: url } = await this.supabase.storage
  .from('kyc-documents')
  .createSignedUrl(`${userId}/${filename}`, 3600);
```

---

## 🌉 BRIDGE CUSTOMER REGISTRATION

Cuando el Staff aprueba el expediente KYC/KYB en la fase de compliance:

```typescript
async registerCustomerInBridge(userId: string): Promise<string> {
  // 1. Obtener datos del perfil y person/business
  const { data: person } = await this.supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .single();

  // 2. Crear customer en Bridge API
  const response = await fetch(`${this.bridgeBaseUrl}/v0/customers`, {
    method: 'POST',
    headers: this.bridgeHeaders,
    body: JSON.stringify({
      type: 'individual',
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      date_of_birth: person.date_of_birth,
      // ... demás campos
    }),
  });

  const bridgeCustomer = await response.json();

  // 3. Guardar bridge_customer_id en profiles
  await this.supabase
    .from('profiles')
    .update({ bridge_customer_id: bridgeCustomer.id })
    .eq('id', userId);

  return bridgeCustomer.id;
}
```

---

## 📦 DTOs CLAVE

### CreatePersonDto
```typescript
export class CreatePersonDto {
  @IsString() @IsNotEmpty()               first_name: string;
  @IsString() @IsNotEmpty()               last_name: string;
  @IsDateString()                         date_of_birth: string;
  @IsISO31661Alpha2()                     nationality: string;
  @IsISO31661Alpha2()                     country_of_residence: string;
  @IsEnum(['passport', 'drivers_license', 'national_id']) id_type: string;
  @IsString()                             id_number: string;
  @IsOptional() @IsDateString()           id_expiry_date?: string;
  @IsEmail()                              email: string;
  @IsPhoneNumber()                        phone: string;
  @IsString()                             address1: string;
  @IsString()                             city: string;
  @IsOptional() @IsString()              state?: string;
  @IsISO31661Alpha2()                     country: string;
  @IsString()                             source_of_funds: string;
  @IsString()                             account_purpose: string;
  @IsBoolean()                            is_pep: boolean;
}
```

### CreateBusinessDto (campos principales)
```typescript
export class CreateBusinessDto {
  @IsString() legal_name: string;
  @IsString() tax_id: string;
  @IsEnum(['LLC', 'Corp', 'SA', 'SAS', 'SRL', 'Other']) entity_type: string;
  @IsISO31661Alpha2() country_of_incorporation: string;
  @IsString() business_description: string;
  @IsString() source_of_funds: string;
  @IsBoolean() conducts_money_services: boolean;
  @IsArray() @IsString({ each: true }) operating_countries: string[];
}
```

---

## 🚨 VALIDACIONES DE NEGOCIO

| Regla | Acción |
|---|---|
| Fecha de nacimiento < 18 años | Rechazar con 400 |
| UBOs con ownership_percent < 0 o > 100 | Rechazar |
| Suma de UBOs ownership > 100% | Advertencia (no bloquear — puede haber múltiples clases de acciones) |
| Id expirado (id_expiry_date < hoy) | Advertencia en la respuesta |
| Más de 1 KYC application activa | Retornar la existente, no crear nueva |
| Submit sin documentos adjuntos | Rechazar con 422 |

---

## ✅ CRITERIOS DE ACEPTACIÓN

1. Un client puede completar el flujo KYC en pasos separados (estado persistente entre llamadas)
2. Los documentos se suben a Supabase Storage y se registran en la DB
3. Al submitir KYC → se crea automáticamente un `compliance_review` via trigger
4. Un client que NO ha completado KYC no puede acceder a endpoints financieros
5. Un Bridge Customer ID se registra correctamente en profiles tras la aprobación

---

## 🔗 SIGUIENTE FASE

Con Onboarding funcional → **[FASE 3: Core Financiero](./04_FASE_3_Core_Financiero.md)**
