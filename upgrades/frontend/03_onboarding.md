# 03 — Onboarding (KYC y KYB)

> **Prefijo:** `/onboarding`  
> **Auth:** Todas protegidas con Bearer Token

---

## Flujo KYC (Persona Natural — Individual)

```
Paso 1: Datos biográficos     POST /onboarding/kyc/person
Paso 2: Subir documentos      POST /onboarding/documents/upload
Paso 3: Aceptar ToS            GET /onboarding/kyc/tos-link → POST /onboarding/kyc/tos-accept
Paso 4: Enviar para revisión   PATCH /onboarding/kyc/application/submit
Paso 5: (Admin aprueba)        → onboarding_status = 'approved'
Paso 6: (Sistema crea wallet)  → automático al aprobar
```

### Paso 1: `POST /onboarding/kyc/person` — Crear/actualizar datos biográficos

**Request Body:**
```json
{
  "first_name": "Juan",
  "last_name": "Pérez",
  "date_of_birth": "1990-05-15",
  "tax_identification_number": "12345678",
  "address": {
    "street_line_1": "Av. Arce 1234",
    "street_line_2": "Piso 3, Oficina B",
    "city": "La Paz",
    "state": "La Paz",
    "postal_code": "00000",
    "country": "BO"
  }
}
```

**Campos obligatorios:** `first_name`, `last_name`, `date_of_birth`, `address` (con `street_line_1`, `city`, `country`)

**Response 201:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "first_name": "Juan",
  "last_name": "Pérez",
  "date_of_birth": "1990-05-15",
  "address": { "..." },
  "created_at": "..."
}
```

---

### Consultar datos: `GET /onboarding/kyc/person`

**Response 200:** Misma estructura que la respuesta del POST

---

### Paso 2: `POST /onboarding/documents/upload` — Subir documento

**Content-Type:** `multipart/form-data`

**Form Fields:**
| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `file` | binary | ✅ | Imagen o PDF (máx 10MB) |
| `document_type` | string | ✅ | `passport`, `drivers_license`, `national_id`, `proof_of_address`, `incorporation_certificate`, `tax_registration`, `bank_statement`, `other` |
| `subject_type` | string | ✅ | `person`, `business`, `director`, `ubo` |
| `subject_id` | uuid | ❌ | ID del sujeto (si aplica) |

**Response 201:**
```json
{
  "id": "uuid",
  "document_type": "national_id",
  "file_url": "https://storage.../documents/...",
  "subject_type": "person",
  "status": "uploaded",
  "created_at": "..."
}
```

**Notas Frontend:**
- Para KYC persona, `subject_type = 'person'`
- Mostrar preview del documento subido
- Permitir subir múltiples documentos
- Tipos mínimos recomendados: `national_id` o `passport` + `proof_of_address`

---

### Consultar documentos: `GET /onboarding/documents`

**Query Params:**
| Param | Tipo | Requerido |
|-------|------|-----------|
| `subject_type` | string | ❌ |

**Response 200:**
```json
[
  {
    "id": "uuid",
    "document_type": "national_id",
    "file_url": "https://...",
    "subject_type": "person",
    "status": "uploaded",
    "created_at": "..."
  }
]
```

---

### URL firmada para documento: `GET /onboarding/documents/:id/signed-url`

**Response 200:**
```json
{
  "signed_url": "https://storage.../signed...",
  "expires_in": 3600
}
```

---

### Paso 3a: `GET /onboarding/kyc/tos-link` — Obtener link ToS

**Query Params:**
| Param | Tipo | Requerido |
|-------|------|-----------|
| `redirect_uri` | string | ❌ |

**Response 200:**
```json
{
  "tos_link": "https://dashboard.bridge.xyz/accept/tos/...",
  "customer_id": "bridge_abc123"
}
```

**Notas Frontend:**
- Abrir este link en un WebView o nueva pestaña
- Tras aceptar, Bridge redirige al `redirect_uri` (o a la app)
- Llamar al endpoint de aceptación tras regresar

---

### Paso 3b: `POST /onboarding/kyc/tos-accept` — Confirmar aceptación ToS

**Request Body:**
```json
{
  "tos_contract_id": "optional-bridge-contract-id"
}
```

**Response 200:**
```json
{
  "message": "ToS aceptado",
  "tos_accepted_at": "2026-01-01T12:00:00Z"
}
```

---

### Paso 4: `PATCH /onboarding/kyc/application/submit` — Enviar expediente

**Request Body:** Ninguno

**Response 200:**
```json
{
  "message": "Expediente KYC enviado para revisión",
  "onboarding_status": "in_review"
}
```

**Errores:**
- `400` — Faltan documentos obligatorios o ToS no aceptado

**Notas Frontend:**
- Validar en el frontend que el usuario tenga al menos un documento subido y ToS aceptado antes de mostrar el botón de enviar
- Después de enviar, mostrar pantalla de "Expediente en revisión"

---

### Consultar estado: `GET /onboarding/kyc/application`

**Response 200:**
```json
{
  "id": "uuid",
  "status": "in_review",
  "submitted_at": "...",
  "reviewed_by": null,
  "review_notes": null,
  "bridge_kyc_link_id": "...",
  "created_at": "..."
}
```

---

## Flujo KYB (Empresa)

```
Paso 1: Datos de empresa       POST /onboarding/kyb/business
Paso 2: Agregar directores     POST /onboarding/kyb/business/directors
Paso 3: Agregar UBOs           POST /onboarding/kyb/business/ubos
Paso 4: Subir documentos       POST /onboarding/documents/upload (subject_type='business')
Paso 5: Aceptar ToS            GET /onboarding/kyb/tos-link → POST /onboarding/kyb/tos-accept
Paso 6: Enviar para revisión   PATCH /onboarding/kyb/application/submit
```

### `POST /onboarding/kyb/business` — Datos de empresa

**Request Body:**
```json
{
  "legal_name": "Guira Technologies SRL",
  "trade_name": "Guira",
  "registration_number": "NIT-12345678",
  "incorporation_country": "BO",
  "incorporation_date": "2024-01-15",
  "business_type": "LLC",
  "address": {
    "street_line_1": "Av. Arce 5678",
    "city": "La Paz",
    "state": "La Paz",
    "postal_code": "00000",
    "country": "BO"
  },
  "website": "https://guira.app",
  "description": "Plataforma fintech de pagos internacionales"
}
```

---

### `GET /onboarding/kyb/business` — Datos de la empresa con directores y UBOs

**Response 200:**
```json
{
  "id": "uuid",
  "legal_name": "Guira Technologies SRL",
  "trade_name": "Guira",
  "directors": [
    { "id": "uuid", "full_name": "Director 1", "position": "CEO" }
  ],
  "ubos": [
    { "id": "uuid", "full_name": "UBO 1", "ownership_percent": 51 }
  ]
}
```

---

### `POST /onboarding/kyb/business/directors` — Agregar director

**Request Body:**
```json
{
  "full_name": "Carlos García",
  "position": "CEO",
  "date_of_birth": "1985-03-20",
  "nationality": "BO",
  "tax_identification_number": "87654321"
}
```

### `DELETE /onboarding/kyb/business/directors/:id` — Eliminar director

---

### `POST /onboarding/kyb/business/ubos` — Agregar beneficiario final (UBO)

**Request Body:**
```json
{
  "full_name": "María López",
  "date_of_birth": "1988-07-10",
  "nationality": "BO",
  "ownership_percent": 51,
  "tax_identification_number": "11223344"
}
```

### `DELETE /onboarding/kyb/business/ubos/:id` — Eliminar UBO

---

### `POST /onboarding/kyb/application` — Crear aplicación KYB
### `GET /onboarding/kyb/application` — Estado de la aplicación
### `GET /onboarding/kyb/tos-link` — Link ToS para empresa
### `POST /onboarding/kyb/tos-accept` — Confirmar ToS empresa
### `PATCH /onboarding/kyb/application/submit` — Enviar para revisión

> Funcionan igual que sus equivalentes KYC, con la diferencia de que aplican al customer tipo `business`.

---

## Pantallas Frontend Requeridas

| Pantalla | Ruta sugerida | Descripción |
|----------|---------------|-------------|
| Selector tipo cuenta | `/onboarding` | ¿Personal o Empresa? |
| Datos personales (KYC) | `/onboarding/kyc` | Formulario biográfico |
| Datos empresa (KYB) | `/onboarding/kyb` | Formulario empresa + directores + UBOs |
| Subir documentos | `/onboarding/documents` | Upload múltiple con preview |
| Aceptar ToS | `/onboarding/tos` | WebView/redirect a Bridge |
| Enviar expediente | `/onboarding/submit` | Resumen + botón enviar |
| En revisión | `/onboarding/status` | Estado con polling o push |
