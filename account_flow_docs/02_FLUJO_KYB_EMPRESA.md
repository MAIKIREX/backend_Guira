# KYB — Alta de Empresa

> **Descripción:** Proceso completo para dar de alta a una empresa u organización en Guira. Incluye registro de datos de la empresa, directores y beneficiarios finales (UBOs). Se compone de 10 pasos secuenciales.
> **Tiempo Estimado:** 10–20 minutos para el usuario + tiempo de revisión compliance (48–96 horas hábiles).
> **Pre-requisito:** El representante legal debe tener su cuenta personal creada en los pasos 1 y 2.

---

## 👣 Pasos del Flujo

### 1. Crear Cuenta del Representante (Registro)

El representante legal o administrador crea su cuenta personal base.

- **Método:** `POST`
- **Endpoint:** `/auth/register`

#### 📥 Body Request
```json
{
  "email": "admin@guirapay.com",
  "password": "EmpresaS3gura!",
  "full_name": "Carlos Slim Representante"
}
```

### 2. Iniciar Sesión

Se autentican las credenciales para obtener el `access_token` necesario.

- **Método:** `POST`
- **Endpoint:** `https://<supabase-project>.supabase.co/auth/v1/token?grant_type=password`

---

### 3. Registrar Datos de la Empresa (KYB Business)

Se envían los datos corporativos. El usuario en sesión quedará ligado como solicitante.

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyb/business`
- **Autenticación requerida:** Sí

#### 📥 Body Request
```json
{
  "legal_name": "Guira Payments S.A. de C.V.",
  "trade_name": "Guira Pay",
  "registration_number": "REG-123456",
  "tax_id": "GPY1234567A0",
  "entity_type": "SA",
  "incorporation_date": "2020-01-15",
  "country_of_incorporation": "MX",
  "state_of_incorporation": "Jalisco",
  "operating_countries": ["MX", "US", "CO"],
  "website": "https://guirapay.com",
  "email": "contacto@guirapay.com",
  "phone": "+52 33 1234 5678",
  "address1": "Av. Vallarta 3000",
  "address2": "Torre B, Piso 5",
  "city": "Guadalajara",
  "state": "Jalisco",
  "postal_code": "44100",
  "country": "MX",
  "business_description": "Plataforma de pagos internacionales y remesas.",
  "business_industry": "fintech",
  "account_purpose": "international_payments",
  "source_of_funds": "business_revenue",
  "conducts_money_services": false,
  "uses_bridge_for_money_services": false
}
```

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "id": "uuid-de-la-empresa",
  "user_id": "uuid-del-representante",
  "legal_name": "Guira Payments S.A. de C.V.",
  "tax_id": "GPY1234567A0",
  "entity_type": "SA",
  "country": "MX",
  "status": "pending",
  "created_at": "2026-03-29T00:00:00Z"
}
```

---

### 4. Registrar Director(es) de la Empresa

Se añade al menos un director. Este paso puede llamarse múltiples veces.

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyb/business/directors`
- **Autenticación requerida:** Sí

#### 📥 Body Request
```json
{
  "first_name": "Carlos",
  "last_name": "Slim",
  "position": "CEO",
  "is_signer": true,
  "date_of_birth": "1975-03-10",
  "nationality": "MX",
  "country_of_residence": "MX",
  "id_type": "passport",
  "id_number": "G98765432",
  "id_expiry_date": "2030-12-31",
  "email": "carlos@guirapay.com",
  "phone": "+52 55 8765 4321",
  "address1": "Av. Reforma 500",
  "city": "Ciudad de México",
  "country": "MX"
}
```

---

### 5. Registrar Beneficiarios Finales (UBOs)

Se añaden los dueños con ≥ 25% de participación. Esto puede repetirse por cada dueño.

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyb/business/ubos`
- **Autenticación requerida:** Sí

#### 📥 Body Request
```json
{
  "first_name": "Ana",
  "last_name": "Martínez",
  "ownership_percent": 51.5,
  "date_of_birth": "1980-08-22",
  "nationality": "MX",
  "country_of_residence": "MX",
  "id_type": "passport",
  "id_number": "A11223344",
  "id_expiry_date": "2028-06-30",
  "tax_id": "MARA800822XYZ",
  "email": "ana.martinez@guirapay.com",
  "phone": "+52 33 9988 7766",
  "address1": "Calle Lerma 45",
  "city": "Guadalajara",
  "state": "Jalisco",
  "postal_code": "44100",
  "country": "MX",
  "is_pep": false
}
```

---

### 6. Crear Aplicación KYB

Inicia formalmente el expediente de empresa.

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyb/application`
- **Autenticación requerida:** Sí

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "id": "uuid-de-la-aplicacion-kyb",
  "business_id": "uuid-de-la-empresa",
  "requester_user_id": "uuid-del-representante",
  "status": "pending",
  "provider": "bridge",
  "source": "platform",
  "tos_accepted_at": null,
  "submitted_at": null,
  "created_at": "2026-03-29T00:00:00Z"
}
```

---

### 7. Subir Documentos de la Empresa

Sube documentos base. Repetir por cada documento necesario (acta constitutiva, comprobante fiscal, id del director, etc.)

- **Método:** `POST`
- **Endpoint:** `/onboarding/documents/upload`
- **Content-Type:** `multipart/form-data`

#### 📥 Payload (Form Data)
- **file:** `[PDF del Acta Constitutiva]`
- **document_type:** `incorporation_certificate`
- **subject_type:** `business`

---

### 8. Aceptar Términos de Servicio (ToS)

El representante acepta los términos corporativos.

- **Método:** `POST`
- **Endpoint:** `/onboarding/kyb/tos-accept`
- **Autenticación requerida:** Sí

#### 📥 Body Request
```json
{
  "tos_contract_id": "bridge-tos-business-v1"
}
```

---

### 9. Enviar Expediente KYB para Revisión

Se valida todo lo anterior (1 director min, documentos min) y se envía al staff.

- **Método:** `PATCH`
- **Endpoint:** `/onboarding/kyb/application/submit`
- **Autenticación requerida:** Sí

#### 📤 Respuesta Exitosa (200 OK)
```json
{
  "id": "uuid-de-la-aplicacion-kyb",
  "business_id": "uuid-de-la-empresa",
  "status": "SUBMITTED",
  "submitted_at": "2026-03-29T17:00:00Z",
  "updated_at": "2026-03-29T17:00:00Z"
}
```

### 10. (Esperar) Revisión de Compliance

El staff revisará y aprobará. Las cuentas, perfiles en Bridge, y la wallet corporativa se crearán en ese mismo instante en background.
