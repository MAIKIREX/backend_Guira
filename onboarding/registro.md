Perfecto. Para lo que quieres hacer en **Guira**, el camino correcto es usar el enfoque **Direct API Integration** de Bridge, no el flujo rápido de `kyc_links`. En ese modelo, tu plataforma controla el frontend y el backend; Bridge solo interviene en dos puntos críticos: la **aceptación del ToS** y la **validación KYC/KYB/compliance**. Bridge exige que el cliente acepte sus términos antes de que procese la información KYC/KYB, y para clientes nuevos esa aceptación parte desde `POST /v0/customers/tos_links`. La aceptación puede quedar embebida en un `iframe` o `webview`, y al finalizar Bridge puede devolverte el `signed_agreement_id` por `redirect_uri`; para implementaciones embebidas también recomienda escuchar `postMessage` con `signedAgreementId`. Ese `signed_agreement_id` luego se envía en `POST /v0/customers` para crear formalmente el cliente. ([Bridge API Docs][1])

## 1. Qué significa “autenticación” en este contexto

En Bridge, lo que tú llamas “autenticación de una cuenta” realmente es un **onboarding regulatorio**. No es login/password tradicional. El flujo base es:

1. El usuario crea o inicia su cuenta interna en Guira.
2. Guira solicita a Bridge un enlace de aceptación de ToS.
3. El usuario acepta el ToS dentro de Guira.
4. Guira recibe el `signed_agreement_id`.
5. Guira crea el `customer` en Bridge con los datos KYC mínimos y ese `signed_agreement_id`.
6. Bridge responde con un objeto `customer` cuyo `status`, `has_accepted_terms_of_service`, `requirements_due`, `future_requirements_due`, `endorsements` y `capabilities` te dicen si el usuario ya puede operar o qué falta. ([Bridge API Docs][1])

Dicho de otra forma: en Guira puedes mantener **todo el UX y toda la identidad de sesión**, pero la “habilitación” financiera del usuario depende de que Bridge valide ToS + customer data + endorsement compliance. ([Bridge API Docs][2])

## 2. Precondiciones de backend

Tu backend debe operar únicamente server-to-server con Bridge usando `Api-Key` por HTTPS. Bridge indica que la API key se envía en el header `Api-Key`, que las requests HTTP planas son rechazadas y que un key inválido devuelve `401 Unauthorized`. Además, todos los `POST` exigen `Idempotency-Key`; Bridge mantiene la idempotencia por 24 horas y reutilizar la misma key después de ese período devuelve `422`. ([Bridge API Docs][3])

Para Guira, antes de tocar cualquier endpoint te recomiendo persistir estas tablas internas:

**Tabla `bridge_customer_sessions`**

* `id`
* `guira_user_id`
* `bridge_customer_id` nullable
* `signed_agreement_id` nullable
* `tos_link_url`
* `tos_link_requested_at`
* `tos_status_local` enum: `pending | approved | expired | failed`
* `bridge_customer_status_snapshot`
* `idempotency_key_tos_link`
* `idempotency_key_customer_create`
* `last_bridge_payload` jsonb
* `created_at`
* `updated_at`

**Tabla `bridge_customer_profiles`**

* `guira_user_id`
* `bridge_customer_id`
* `bridge_customer_type`
* `email`
* `first_name`
* `last_name`
* `birth_date`
* `country_iso3`
* `nationality_iso3`
* `phone_e164`
* `residential_address_json`
* `identifying_information_json`
* `endorsements_json`
* `requirements_due_json`
* `future_requirements_due_json`
* `capabilities_json`
* `has_accepted_terms_of_service`
* `status`
* `rejection_reasons_json`
* `created_at`
* `updated_at`

Eso te permite reintentos seguros, trazabilidad y auditoría.

## 3. Datos mínimos que debes recolectar en Guira

Bridge publica los requisitos estándar para onboarding individual: nombre, apellido, país, dirección física, ciudad, código postal, subdivisión/provincia/estado, fecha de nacimiento, email y número de identidad. Para residentes de USA, el identificador esperado es SSN; para no residentes de USA, el identificador nacional. También puede requerir verificación de ID, proof of address y, para poblaciones de mayor riesgo o mayor volumen, occupation, employment status, source of funds, purpose of account, montos mensuales esperados e intermediary status. ([Bridge API Docs][4])

Para una primera fase robusta de Guira, el formulario debería pedir desde el inicio:

* `first_name`
* `last_name`
* `email`
* `phone` en formato E.164
* `birth_date` en `YYYY-MM-DD`
* `residential_address.street_line_1`
* `residential_address.street_line_2` opcional
* `residential_address.city`
* `residential_address.subdivision`
* `residential_address.postal_code`
* `residential_address.country` en ISO-3166-1 alpha-3
* `nationality` en ISO-3166-1 alpha-3
* `identifying_information[]` según país
* opcionales preventivos: `employment_status`, `source_of_funds`, `account_purpose`, `expected_monthly_payments_usd`, `acting_as_intermediary`

Aunque `POST /v0/customers` permite crear un customer incompleto, Bridge aclara que sin los campos necesarios no obtendrá los endorsements para transaccionar. En otras palabras, crear un customer “vacío” técnicamente funciona, pero operativamente te deja un usuario bloqueado. ([Bridge API Docs][5])

## 4. Flujo exacto recomendado para Guira

### Fase A: Crear sesión de onboarding local en Guira

Cuando el usuario pulsa “Continuar con cuenta Bridge”:

1. Guira crea un registro local `bridge_customer_session`.
2. Genera un `state` propio antifraude/anti-CSRF.
3. Genera un `idempotencyKey` para pedir ToS Link.

Esto todavía no toca Bridge.

### Fase B: Pedir enlace de ToS a Bridge

**Endpoint Bridge**

```http
POST /v0/customers/tos_links
Headers:
  Api-Key: <bridge_api_key>
  Idempotency-Key: <uuid-v4>
```

La doc de Bridge para nuevos clientes muestra que la respuesta contiene:

```json
{
  "url": "https://dashboard.bridge.xyz/accept-terms-of-service?session_token=..."
}
```

y especifica que puedes pasar un `redirect_uri` a esa URL para que al terminar vuelva a tu app con `signed_agreement_id` como query param. ([Bridge API Docs][1])

### Qué hace Guira con esa URL

Tu backend no debe exponer la API key al frontend. Entonces:

1. Backend llama a Bridge.
2. Recibe `url`.
3. Le agrega un `redirect_uri` propio, por ejemplo:

```text
https://app.guira.com/bridge/tos/callback?state=<signed-state>
```

4. Entrega al frontend la URL final para abrirla en:

   * `iframe`, o
   * modal con webview embebido, o
   * popup controlado.

Bridge documenta explícitamente que ese ToS puede mostrarse en `iFrame` o nueva ventana, y que puede devolver el `signed_agreement_id` por `redirect_uri`; para iFrame/WebView recomienda escuchar `postMessage` con `signedAgreementId`. ([Bridge API Docs][1])

### Fase C: Recepción del `signed_agreement_id`

Tienes dos opciones.

#### Opción 1: `redirect_uri`

El usuario acepta el ToS y Bridge redirige a algo como:

```text
https://app.guira.com/bridge/tos/callback?state=abc123&signed_agreement_id=uuid-bridge
```

Tu frontend o backend callback:

* valida `state`
* extrae `signed_agreement_id`
* lo persiste en `bridge_customer_sessions`
* marca `tos_status_local = approved`

#### Opción 2: `postMessage`

Si realmente lo embebes, puedes escuchar el `postMessage` y capturar `signedAgreementId`, luego mandarlo a tu backend para persistencia. Esto está recomendado por la propia documentación para iFrame/WebView. ([Bridge API Docs][1])

### Fase D: Crear customer en Bridge

Una vez tengas `signed_agreement_id`, haces:

**Endpoint Bridge**

```http
POST /v0/customers
Headers:
  Api-Key: <bridge_api_key>
  Content-Type: application/json
  Idempotency-Key: <uuid-v4>
```

El body debe incluir `type`, datos personales, dirección, `birth_date`, `signed_agreement_id` e `identifying_information`. Bridge indica expresamente que, tras obtener `signed_agreement_id`, ya puedes usar Customers API para crear el cliente. ([Bridge API Docs][2])

### Ejemplo técnico para individuo no-USA

```json
{
  "type": "individual",
  "first_name": "Juan",
  "last_name": "Perez",
  "email": "juan.perez@example.com",
  "phone": "+59171234567",
  "birth_date": "1998-05-18",
  "signed_agreement_id": "d536a227-06d3-4de1-acd3-8b5131730480",
  "residential_address": {
    "street_line_1": "Av. Siempre Viva 123",
    "city": "La Paz",
    "subdivision": "La Paz",
    "postal_code": "0000",
    "country": "BOL"
  },
  "nationality": "BOL",
  "endorsements": ["base"],
  "identifying_information": [
    {
      "type": "national_id",
      "issuing_country": "bol",
      "number": "12345678"
    }
  ]
}
```

### Ejemplo técnico para individuo USA

```json
{
  "type": "individual",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "+12223334444",
  "birth_date": "1990-01-15",
  "signed_agreement_id": "d536a227-06d3-4de1-acd3-8b5131730480",
  "residential_address": {
    "street_line_1": "123 Main St",
    "city": "New York City",
    "subdivision": "New York",
    "postal_code": "10001",
    "country": "USA"
  },
  "endorsements": ["base"],
  "identifying_information": [
    {
      "type": "ssn",
      "issuing_country": "usa",
      "number": "xxx-xx-xxxx"
    }
  ]
}
```

La documentación de Bridge muestra precisamente ejemplos de `ssn` para USA y señala que para no-USA suele requerirse nacional identity number; además, `birth_date` debe venir en formato `yyyy-mm-dd` y el cliente debe ser mayor de 18 años. ([Bridge API Docs][2])

## 5. Qué esperas de retorno al crear el customer

El objeto customer de Bridge te devuelve, entre otros, estos campos que debes considerar “fuente de verdad” para compliance:

* `id`
* `status`
* `has_accepted_terms_of_service`
* `endorsements`
* `requirements_due`
* `future_requirements_due`
* `capabilities`
* `rejection_reasons`
* `created_at`
* `updated_at` ([Bridge API Docs][6])

### Estados que debes modelar en Guira

Bridge documenta estados como:

* `not_started`
* `incomplete`
* `under_review`
* `active`
* `rejected`
* `paused`
* `offboarded`
* `awaiting_questionnaire`
* `awaiting_ubo` ([Bridge API Docs][6])

Para un individuo típico, en Guira puedes mapearlos así:

* `not_started`: creó cuenta Guira, no terminó ToS/customer creation
* `incomplete`: customer creado pero faltan datos
* `under_review`: Bridge revisando, no habilitar operaciones de riesgo
* `active`: customer listo
* `rejected`: bloquear y mostrar causa user-safe
* `paused` / `offboarded`: bloquear totalmente

### `requirements_due`

Bridge usa `requirements_due` para señalar exigencias inmediatas, por ejemplo:

* `id_verification`
* `external_account` ([Bridge API Docs][6])

### `rejection_reasons`

Bridge diferencia entre:

* `developer_reason`: para uso interno
* `reason`: apta para compartir con el cliente final. ([Bridge API Docs][7])

Eso es importante: en Guira no deberías mostrar `developer_reason` al usuario final.

## 6. Qué endorsements debes pedir al crear el customer

Si no envías `endorsements`, Bridge intentará otorgar `base` y `sepa`. Bridge define:

* `base`: USD rails
* `sepa`: servicios EUR/SEPA
* `spei`: MXN
* `pix`: BRL
* `faster_payments`: GBP
* `cop`: COP
* `cards`: tarjetas ([Bridge API Docs][8])

Para Guira, en la primera fase yo pediría solo:

```json
"endorsements": ["base"]
```

porque pedir `sepa` de entrada puede activar requerimientos extra. Para usar SEPA Bridge exige aceptación de la nueva versión del ToS en clientes existentes si no la habían firmado. ([Bridge API Docs][1])

## 7. Cómo manejar clientes incompletos o correcciones

Si Bridge te devuelve customer creado pero con faltantes, debes actualizarlo con:

```http
PUT /v0/customers/{customerID}
Headers:
  Api-Key: <bridge_api_key>
  Content-Type: application/json
```

Bridge indica que en `PUT` puedes mandar cualquier subconjunto de campos. Ese endpoint sirve para completar info faltante, corregir address, phone, employment/source-of-funds, etc. ([Bridge API Docs][9])

Ejemplo de uso:

* el usuario terminó ToS
* se creó customer
* Bridge respondió `status: under_review` y `requirements_due: ["id_verification"]`
* luego Guira recolecta imágenes del documento o datos complementarios
* hace `PUT /v0/customers/{id}` con los campos faltantes
* consulta luego `GET /v0/customers/{id}` para ver el nuevo estado. ([Bridge API Docs][9])

## 8. Webhooks: no lo dejes para después

Para esta primera sección del backend, aunque el foco sea onboarding, igual debes preparar webhooks desde ya. Bridge permite suscribirte a categorías como `customer` y `kyc_link`; los webhooks usan HTTPS y te entregan una `public_key` por endpoint para verificar firmas. La firma viene en `X-Webhook-Signature` con formato `t=<timestamp>,v0=<base64signature>`, y la verificación se hace usando `timestamp + "." + raw_body`, hash SHA256 y la `public_key` PEM del endpoint. ([Bridge API Docs][10])

Para onboarding yo suscribiría al menos:

* `customer`
* `kyc_link`

Aunque uses Direct API y no `kyc_links`, el más crítico es `customer`.

### Endpoint de creación de webhook

```http
POST /v0/webhooks
Headers:
  Api-Key: <bridge_api_key>
  Content-Type: application/json
  Idempotency-Key: <uuid-v4>
```

### Body sugerido

```json
{
  "url": "https://api.guira.com/webhooks/bridge",
  "event_epoch": "webhook_creation",
  "event_categories": ["customer", "kyc_link"]
}
```

Bridge documenta que los webhooks se crean inicialmente en estado `disabled`, y que la configuración incluye la `public_key` necesaria para verificar autenticidad. ([Bridge API Docs][11])

## 9. Diseño de flujo backend en NestJS

### Endpoint interno 1

```http
POST /bridge/onboarding/tos-link
```

**Input Guira**

```json
{
  "guiraUserId": "uuid"
}
```

**Acción backend**

* busca sesión local existente
* si ya existe `signed_agreement_id`, no vuelve a pedir ToS
* si no existe, llama a `POST /v0/customers/tos_links`
* persiste `tos_link_url`, `idempotency_key_tos_link`
* devuelve URL final con `redirect_uri`

**Output**

```json
{
  "tosUrl": "https://dashboard.bridge.xyz/accept-terms-of-service?...&redirect_uri=..."
}
```

### Endpoint interno 2

```http
GET /bridge/tos/callback
```

**Input**

* `state`
* `signed_agreement_id`

**Acción**

* valida `state`
* guarda `signed_agreement_id`
* marca sesión como `approved`
* redirige al frontend de Guira

### Endpoint interno 3

```http
POST /bridge/onboarding/customers
```

**Input**
Todos los datos KYC de Guira.

**Acción**

* valida que exista `signed_agreement_id`
* construye payload Bridge
* llama `POST /v0/customers`
* persiste `bridge_customer_id`, `status`, `endorsements`, `requirements_due`, `capabilities`
* devuelve estado simplificado al frontend

**Output sugerido**

```json
{
  "bridgeCustomerId": "cust_abc123",
  "status": "under_review",
  "hasAcceptedTermsOfService": true,
  "requirementsDue": ["id_verification"],
  "capabilities": {
    "payin_crypto": "active",
    "payout_crypto": "active",
    "payin_fiat": "pending",
    "payout_fiat": "pending"
  }
}
```

### Endpoint interno 4

```http
PUT /bridge/onboarding/customers/:bridgeCustomerId
```

Para completar o corregir requisitos faltantes.

### Endpoint interno 5

```http
GET /bridge/onboarding/customers/:bridgeCustomerId/status
```

Este puede leer de tu DB o sincronizar con `GET /v0/customers/{id}`.

## 10. Máquina de estados que te recomiendo en Guira

Usa una FSM interna así:

* `LOCAL_ACCOUNT_CREATED`
* `BRIDGE_TOS_PENDING`
* `BRIDGE_TOS_ACCEPTED`
* `BRIDGE_CUSTOMER_CREATED`
* `BRIDGE_CUSTOMER_UNDER_REVIEW`
* `BRIDGE_CUSTOMER_ACTIVE`
* `BRIDGE_CUSTOMER_REJECTED`
* `BRIDGE_CUSTOMER_PAUSED`
* `BRIDGE_CUSTOMER_OFFBOARDED`

Transiciones:

* `LOCAL_ACCOUNT_CREATED -> BRIDGE_TOS_PENDING`
* `BRIDGE_TOS_PENDING -> BRIDGE_TOS_ACCEPTED`
* `BRIDGE_TOS_ACCEPTED -> BRIDGE_CUSTOMER_CREATED`
* `BRIDGE_CUSTOMER_CREATED -> BRIDGE_CUSTOMER_UNDER_REVIEW|ACTIVE|REJECTED`
* posteriores cambios vía webhook `customer`

## 11. Riesgos y puntos donde no debes improvisar

Primero, **no generes el customer antes del ToS**. Bridge es explícito: los clientes deben aceptar ToS antes de que procese KYC/KYB. ([Bridge API Docs][1])

Segundo, **no pongas la API key en frontend**. Bridge indica que la autenticación se hace con API keys de cuenta y que otorgan acceso total. ([Bridge API Docs][3])

Tercero, **usa idempotencia en todos los POST**: `tos_links`, `customers`, `webhooks`. ([Bridge API Docs][12])

Cuarto, **no dependas solo de polling**. El estado regulatorio puede cambiar a `under_review`, `active`, `rejected`, `paused` u `offboarded`; usa webhooks firmados y verificados. ([Bridge API Docs][6])

Quinto, **separa razones internas vs. reasons user-facing**. `developer_reason` puede contener datos sensibles. ([Bridge API Docs][7])

Sexto, **pide solo el endorsement que necesitas**. Para la fase inicial de Guira, `base` es lo más limpio. ([Bridge API Docs][8])

## 12. Flujo end-to-end resumido

Quedaría así:

```text
[Guira Frontend]
   -> POST /bridge/onboarding/tos-link
[Guira Backend]
   -> POST Bridge /v0/customers/tos_links
   <- { url }
[Guira Frontend]
   -> abre url Bridge embebida
[Bridge ToS]
   -> redirect_uri?state=...&signed_agreement_id=...
[Guira Backend/Frontend]
   -> persiste signed_agreement_id
[Guira Frontend]
   -> POST /bridge/onboarding/customers
[Guira Backend]
   -> POST Bridge /v0/customers
   <- customer object
[Guira Backend]
   -> persiste status / requirements / endorsements
[Bridge]
   -> webhook customer
[Guira Backend]
   -> verifica firma y actualiza estado local
```

## 13. Recomendación concreta para tu primera implementación

Para que esta “primera sección del backend” salga bien, yo la dividiría en 3 entregables:

**Entrega 1**
Implementar `POST /bridge/onboarding/tos-link` + callback `signed_agreement_id`.

**Entrega 2**
Implementar `POST /bridge/onboarding/customers` con `endorsements: ["base"]` y persistencia completa del customer object.

**Entrega 3**
Implementar webhooks `customer`, verificación de firma y sincronización de estados.

Ese orden minimiza incertidumbre y te deja un onboarding sólido, embebido y 100% dentro de la experiencia Guira, usando a Bridge solo como proveedor regulatorio y de infraestructura. ([Bridge API Docs][1])

En el siguiente paso te puedo bajar esto a código con una propuesta de módulos NestJS, DTOs, entidades Prisma y ejemplos reales de controladores/servicios para `tos-link`, `callback`, `create-customer` y `webhook`.

[1]: https://apidocs.bridge.xyz/platform/customers/customers/tos "Terms of service - Bridge"
[2]: https://apidocs.bridge.xyz/platform/customers/customers/api "Customers API - Bridge"
[3]: https://apidocs.bridge.xyz/api-reference/introduction/introduction "Authentication - Bridge"
[4]: https://apidocs.bridge.xyz/platform/customers/compliance/individuals "Individuals - Bridge"
[5]: https://apidocs.bridge.xyz/api-reference/customers/create-a-customer "Create a customer - Bridge"
[6]: https://apidocs.bridge.xyz/api-reference/customers/get-a-single-customer-object "Get a single customer object - Bridge"
[7]: https://apidocs.bridge.xyz/platform/customers/customers/kyclinks "KYC links for new customers - Bridge"
[8]: https://apidocs.bridge.xyz/platform/customers/customers/endorsements?utm_source=chatgpt.com "Endorsements"
[9]: https://apidocs.bridge.xyz/api-reference/customers/update-a-single-customer-object "Update a single customer object - Bridge"
[10]: https://apidocs.bridge.xyz/api-reference/webhooks/update-a-webhook "Update a webhook - Bridge"
[11]: https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-webhooks "Configure webhooks - Bridge"
[12]: https://apidocs.bridge.xyz/api-reference/introduction/idempotence "Idempotency - Bridge"
