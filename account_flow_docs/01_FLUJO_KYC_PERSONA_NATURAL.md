# KYC — Alta de Persona Natural

> **Descripción:** Proceso completo para dar de alta a un usuario individual (persona física) en Guira. Se compone de 7 pasos secuenciales.
> **Tiempo Estimado:** 5–10 minutos para el usuario + tiempo de revisión del equipo compliance (24–72 horas hábiles).

---

## 👣 Pasos del Flujo

### 1. Crear Cuenta (Registro)

El usuario crea su cuenta en la plataforma. Supabase Auth crea el usuario y un trigger de base de datos crea automáticamente el registro en la tabla `profiles` con rol `client` y estado `pending`.

- **Método:** `POST`
- **Endpoint:** `/auth/register`
- **Autenticación requerida:** No

#### 📥 Body Request
```json
{
  "email": "maria.gonzalez@ejemplo.com",
  "password": "MiClave$egura123",
  "full_name": "María González"
}
```

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "user_id": "uuid-del-usuario",
  "email": "maria.gonzalez@ejemplo.com",
  "access_token": "",
  "refresh_token": "",
  "expires_in": 0,
  "onboarding_status": "pending"
}
```

---

### 2. Iniciar Sesión y Obtener Token

El usuario autentica sus credenciales directamente con Supabase Auth para obtener los tokens JWT necesarios para todas las llamadas siguientes.

- **Método:** `POST`
- **Endpoint:** `https://<supabase-project>.supabase.co/auth/v1/token?grant_type=password`
- **Nota:** Este endpoint es de Supabase Auth, el frontend llama directamente al SDK de Supabase.

#### 📥 Body Request
```json
{
  "email": "maria.gonzalez@ejemplo.com",
  "password": "MiClave$egura123"
}
```

#### 📤 Respuesta Exitosa (200 OK)
```json
{
  "access_token": "eyJhbGciOiJIUzI1...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "refresh-token-aqui",
  "user": {
    "id": "uuid-del-usuario",
    "email": "maria.gonzalez@ejemplo.com"
  }
}
```

---

### 3. Enviar Datos Biográficos (KYC Person)

El usuario envía sus datos personales completos. Este es el núcleo del KYC. El sistema valida que el usuario sea mayor de 18 años. Si ya existen datos previos, se actualizan (UPSERT).

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyc/person`
- **Autenticación requerida:** Sí

#### 📥 Body Request
```json
{
  "first_name": "María",
  "last_name": "González",
  "date_of_birth": "1990-05-15",
  "nationality": "MX",
  "country_of_residence": "MX",
  "id_type": "passport",
  "id_number": "G12345678",
  "id_expiry_date": "2030-12-31",
  "email": "maria.gonzalez@ejemplo.com",
  "phone": "+52 55 1234 5678",
  "address1": "Av. Reforma 123",
  "address2": "Piso 4",
  "city": "Ciudad de México",
  "state": "CDMX",
  "postal_code": "06600",
  "country": "MX",
  "tax_id": "GOMA900515ABC",
  "source_of_funds": "salary",
  "account_purpose": "international_payments",
  "is_pep": false
}
```

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "id": "uuid-de-la-persona",
  "user_id": "uuid-del-usuario",
  "first_name": "María",
  "last_name": "González",
  "date_of_birth": "1990-05-15",
  "nationality": "MX",
  "country_of_residence": "MX",
  "id_type": "passport",
  "id_number": "G12345678",
  "email": "maria.gonzalez@ejemplo.com",
  "city": "Ciudad de México",
  "country": "MX",
  "source_of_funds": "salary",
  "account_purpose": "international_payments",
  "is_pep": false,
  "created_at": "2026-03-29T00:00:00Z",
  "updated_at": "2026-03-29T00:00:00Z"
}
```

---

### 4. Crear Aplicación KYC

Inicia formalmente el expediente de verificación KYC. El sistema verifica que existan datos biográficos. El perfil del usuario pasa a estado `kyc_started`.

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyc/application`
- **Autenticación requerida:** Sí
- **Nota:** No requiere body, obtiene el ID del usuario del token.

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "id": "uuid-de-la-aplicacion-kyc",
  "user_id": "uuid-del-usuario",
  "person_id": "uuid-de-la-persona",
  "status": "pending",
  "provider": "bridge",
  "source": "platform",
  "tos_accepted_at": null,
  "submitted_at": null,
  "created_at": "2026-03-29T00:00:00Z"
}
```

---

### 5. Subir Documento de Identidad

El usuario sube una foto/escaneo de su documento de identidad. El backend lo almacena en Supabase Storage (bucket: `kyc-documents`).

- **Método:** `POST`
- **Endpoint:** `/onboarding/documents/upload`
- **Autenticación requerida:** Sí
- **Content-Type:** `multipart/form-data`

#### 📥 Payload (Form Data)
- **file:** `[ARCHIVO BINARIO]` (PDF, JPG, PNG. Máx 10 MB)
- **document_type:** `passport`
- **subject_type:** `person`

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "id": "uuid-del-documento",
  "user_id": "uuid-del-usuario",
  "document_type": "passport",
  "subject_type": "person",
  "file_name": "pasaporte_maria.jpg",
  "mime_type": "image/jpeg",
  "file_size_bytes": 2048000,
  "storage_path": "uuid-del-usuario/2026-03-29_passport_abc123.jpg",
  "status": "pending",
  "created_at": "2026-03-29T00:00:00Z"
}
```

---

### 6. Obtener Link y Aceptar Términos de Servicio (ToS)

El usuario debe aceptar los Términos de Servicio de Bridge antes de enviar su información. El proceso consta de dos fases:

#### 6.1 Obtener Link de ToS
El frontend solicita el enlace donde el cliente aceptará los términos. El backend automáticamente determina si el cliente es nuevo (`POST /v0/customers/tos_links`) o existente (`GET /v0/customers/:id/tos_acceptance_link`) en Bridge.

- **Método:** `GET`
- **Endpoint:** `/onboarding/kyc/tos-link?redirect_uri=https://tu-app.com/callback` *(opcional)*
- **Autenticación requerida:** Sí

**📤 Respuesta Exitosa (200 OK):**
```json
{
  "url": "https://dashboard.bridge.xyz/accept-terms-of-service?..."
}
```
> El Frontend redirige al usuario a esta `url` o la muestra en un iFrame. Tras aceptar, Bridge retorna el control (vía redirección a `redirect_uri` o `postMessage`) y provee un `signed_agreement_id`.

#### 6.2 Confirmar Aceptación en Guira
Una vez completado el flujo en Bridge, se informa al backend enviando el ID del contrato firmado.

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyc/tos-accept`
- **Autenticación requerida:** Sí

**📥 Body Request:**
```json
{
  "tos_contract_id": "signed_agreement_id_recibido_de_bridge"
}
```

**📤 Respuesta Exitosa (200 OK):**
```json
{
  "id": "uuid-de-la-aplicacion-kyc",
  "tos_accepted_at": "2026-03-29T15:30:00Z",
  "tos_contract_id": "signed_agreement_id_recibido_de_bridge",
  "updated_at": "2026-03-29T15:30:00Z"
}
```

---

### 7. Enviar Expediente KYC para Revisión

Envía formalmente el expediente completo al equipo de compliance de Guira. El sistema valida que existan documentos adjuntos y que el ToS haya sido aceptado.

- **Método:** `PATCH`
- **Endpoint:** `/onboarding/kyc/application/submit`
- **Autenticación requerida:** Sí

#### 📤 Respuesta Exitosa (200 OK)
```json
{
  "id": "uuid-de-la-aplicacion-kyc",
  "user_id": "uuid-del-usuario",
  "status": "SUBMITTED",
  "submitted_at": "2026-03-29T16:00:00Z",
  "updated_at": "2026-03-29T16:00:00Z"
}
```
> [!NOTE]
> En este punto, el perfil del usuario `onboarding_status` ha cambiado a `in_review`.

---

## ⏳ Post-Envío: Revisión de Compliance y Activación

Una vez enviado el expediente, el equipo de compliance realiza la revisión.

1. **APROBADO**:
   - `kyc_applications.status` → `approved`
   - Se crea el cliente en Bridge API y se guarda su `bridge_customer_id`.
   - Se crea la Wallet (USD) y registro de balance inicial.
2. **RECHAZADO**:
   - `kyc_applications.status` → `rejected`
   - El usuario es notificado.
3. **CORRECCIONES SOLICITADAS**:
   - `kyc_applications.status` → `needs_review`
   - El usuario recibe notificación de lo que debe corregir y luego vuelve a llamar al paso 7.
