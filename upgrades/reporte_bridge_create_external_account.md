# Reporte: Crear una cuenta externa en Bridge

**Endpoint analizado:** `POST /v0/customers/{customerID}/external_accounts`  
**Documentación oficial:** https://apidocs.bridge.xyz/api-reference/external-accounts/create-a-new-external-account

---

## 1) ¿Qué hace este endpoint?

Este endpoint crea una **External Account** asociada a un cliente de Bridge. En el ejemplo visible de la documentación, se trata de una **cuenta bancaria de Estados Unidos** (`account_type: "us"`) para recibir o enviar fondos por **ACH/Wire**.

La documentación también muestra que el endpoint soporta otros tipos de cuentas externas como **IBAN, SWIFT, CLABE, Pix, FPS y Bre-B**, pero en la vista pública de esta página los campos que aparecen desplegados con más detalle son los de la variante **US / ACH-Wire**.

---

## 2) Endpoint completo

```http
POST https://api.bridge.xyz/v0/customers/{customerID}/external_accounts
```

### Path parameter obligatorio

- `customerID` *(string, required)*  
  Identificador del cliente Bridge al que pertenecerá la cuenta externa.

Restricciones documentadas:
- longitud: `1 - 42`
- patrón: `[a-z0-9]*`

---

## 3) Headers obligatorios

### `Api-Key`
- Tipo: `string`
- Ubicación: `header`
- Obligatorio: **sí**
- Uso: tu clave privada o de desarrollador para autenticar la petición.

### `Idempotency-Key`
- Tipo: `string`
- Ubicación: `header`
- Obligatorio: **sí**
- Uso: evita crear duplicados si reintentas la misma petición.

### Header recomendado adicional

```http
Content-Type: application/json
```

---

## 4) Cuerpo JSON: campos necesarios sí o sí

Para el caso documentado de cuenta externa **US**, estos son los campos que debes enviar obligatoriamente.

### 4.1 `account_owner_name`
- Tipo: `string`
- Obligatorio: **sí**
- Descripción: nombre del titular de la cuenta bancaria.
- Longitud documentada: `1 - 256`

### 4.2 `account_type`
- Tipo: `enum<string>`
- Obligatorio: **sí**
- Valor visible en la doc para esta variante: `"us"`
- Descripción: define el tipo de cuenta externa.

### 4.3 `currency`
- Tipo: `enum<string>`
- Obligatorio: **sí**
- Para cuentas US debe ser: `"usd"`
- Descripción: moneda asociada a la cuenta.

### 4.4 `account`
- Tipo: `object`
- Obligatorio: **sí**
- Descripción: objeto con los datos bancarios de la cuenta.

En el ejemplo cURL visible, este objeto contiene:

#### `account.account_number`
- Tipo: `string`
- Necesario en la práctica para la variante US mostrada
- Descripción: número de cuenta bancaria.

#### `account.routing_number`
- Tipo: `string`
- Necesario en la práctica para la variante US mostrada
- Descripción: routing number bancario.

#### `account.checking_or_savings`
- Tipo: `string`
- Valor de ejemplo: `"checking"`
- Descripción: tipo de cuenta bancaria.

> Nota importante: aunque la tabla visible no despliega cada hijo del objeto `account` con el mismo detalle que el ejemplo, el ejemplo oficial sí muestra claramente estos tres campos dentro de `account` para la creación de una cuenta US.

---

## 5) Campos opcionales visibles en la documentación

### 5.1 `bank_name`
- Tipo: `string`
- Obligatorio: no aparece marcado como required en la tabla visible
- Descripción: nombre del banco.
- Longitud documentada: `1 - 256`
- Ejemplo: `"Wells Fargo"`

### 5.2 `address`
- Tipo: `object`
- Obligatorio: no aparece marcado globalmente como required en la tabla visible
- Descripción: dirección del beneficiario de la cuenta.

En el ejemplo oficial se usa así:

```json
"address": {
  "street_line_1": "123 Main St",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94102",
  "country": "USA"
}
```

Campos visibles por ejemplo:
- `street_line_1`
- `city`
- `state`
- `postal_code`
- `country`

### Recomendación importante de Bridge
La página incluye una nota que indica que, para cuentas externas de EE. UU., recomiendan leer la documentación de **US Beneficiary Address Validation** para evitar problemas por direcciones incorrectas.

Eso es consistente con otro campo de respuesta llamado `beneficiary_address_valid`, lo que sugiere que la dirección del beneficiario es operativamente importante en cuentas US.

---

## 6) Campos deprecated que conviene NO usar

La documentación muestra estos campos en el nivel raíz, pero marcados como **deprecated**:

### 6.1 `account_number`
- Tipo: `string`
- Estado: **deprecated**
- Descripción: se está reemplazando por `account.account_number` para cuentas US.
- Longitud mínima documentada: `12`

### 6.2 `routing_number`
- Tipo: `string`
- Estado: **deprecated**
- Descripción: se está reemplazando por `account.routing_number` para cuentas US.
- Longitud mínima documentada: `9`

### Conclusión práctica
No conviene enviar:

```json
{
  "account_number": "...",
  "routing_number": "..."
}
```

En su lugar conviene enviar:

```json
{
  "account": {
    "account_number": "...",
    "routing_number": "..."
  }
}
```

---

## 7) Payload mínimo recomendado

Tomando el ejemplo oficial y evitando campos deprecated, un payload mínimo razonable para **US / ACH-Wire** sería:

```json
{
  "currency": "usd",
  "account_owner_name": "John Doe",
  "account_type": "us",
  "account": {
    "account_number": "1210002481111",
    "routing_number": "121000248",
    "checking_or_savings": "checking"
  }
}
```

---

## 8) Payload recomendado más completo

Este es el formato más completo basado en el ejemplo oficial visible:

```json
{
  "currency": "usd",
  "bank_name": "Wells Fargo",
  "account_owner_name": "John Doe",
  "account_type": "us",
  "account": {
    "account_number": "1210002481111",
    "routing_number": "121000248",
    "checking_or_savings": "checking"
  },
  "address": {
    "street_line_1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "USA"
  }
}
```

---

## 9) Ejemplo completo en cURL

```bash
curl --request POST \
  --url https://api.bridge.xyz/v0/customers/{customerID}/external_accounts \
  --header 'Api-Key: <api-key>' \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: <idempotency-key>' \
  --data '{
    "currency": "usd",
    "bank_name": "Wells Fargo",
    "account_owner_name": "John Doe",
    "account_type": "us",
    "account": {
      "account_number": "1210002481111",
      "routing_number": "121000248",
      "checking_or_savings": "checking"
    },
    "address": {
      "street_line_1": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postal_code": "94102",
      "country": "USA"
    }
  }'
```

---

## 10) Respuesta esperada (201 Created)

La documentación muestra este ejemplo de respuesta:

```json
{
  "id": "ea_123",
  "account_type": "us",
  "currency": "usd",
  "customer_id": "cust_123",
  "account_owner_name": "John Doe",
  "bank_name": "Wells Fargo",
  "last_4": "1111",
  "active": true,
  "beneficiary_address_valid": true,
  "account": {
    "last_4": "1111",
    "routing_number": "121000248",
    "checking_or_savings": "checking"
  },
  "created_at": "2020-01-01T00:00:00.000Z",
  "updated_at": "2020-01-02T00:00:00.000Z"
}
```

---

## 11) Descripción del JSON de respuesta

### `id`
- Tipo: `string`
- Obligatorio: sí
- Descripción: identificador único de la External Account creada.

### `customer_id`
- Tipo: `string`
- Obligatorio: sí
- Descripción: ID del cliente Bridge al que pertenece esta cuenta externa.

### `account_owner_name`
- Tipo: `string`
- Obligatorio: sí
- Descripción: nombre del titular de la cuenta.

### `created_at`
- Tipo: `string<date-time>`
- Obligatorio: sí
- Descripción: fecha/hora de creación del recurso.

### `updated_at`
- Tipo: `string<date-time>`
- Obligatorio: sí
- Descripción: fecha/hora de la última actualización del recurso.

### `active`
- Tipo: `boolean`
- Obligatorio: sí
- Descripción: indica si la cuenta externa está activa.

### `account_type`
- Tipo: `enum<string>`
- Obligatorio: sí
- Valor visible en la doc para este caso: `"us"`
- Descripción: tipo de cuenta externa.

### `currency`
- Tipo: `enum<string>`
- Obligatorio: sí
- Valor visible para este caso: `"usd"`
- Descripción: moneda de la cuenta.

### `account`
- Tipo: `object`
- Obligatorio: sí
- Descripción: objeto con datos de la cuenta externa ya normalizados para respuesta.

Subcampos visibles en el ejemplo:

#### `account.last_4`
- Tipo: `string`
- Descripción: últimos 4 dígitos del número de cuenta.

#### `account.routing_number`
- Tipo: `string`
- Descripción: routing number asociado.

#### `account.checking_or_savings`
- Tipo: `string`
- Descripción: tipo de cuenta retornado por Bridge.

### `bank_name`
- Tipo: `string`
- Descripción: nombre del banco.

### `beneficiary_address_valid`
- Tipo: `boolean`
- Descripción: indica si la dirección del beneficiario es válida.
- Importancia: la documentación aclara que una dirección válida es requerida para cuentas externas US.

### `last_4`
- Tipo: `string`
- Estado: **deprecated**
- Descripción: últimos 4 dígitos del número de cuenta a nivel raíz. Bridge indica que este campo será reemplazado por `account.last_4`.

---

## 12) Otros campos de respuesta que pueden aparecer

La documentación también lista algunos campos adicionales que pueden existir según el tipo de cuenta o el estado del recurso.

### `account_owner_type`
- Tipo: `enum<string>`
- Valores: `individual`, `business`
- Descripción: tipo de titularidad.
- Nota: la doc aclara que este campo es **requerido cuando `account_type` es `iban`**.

### `first_name`
- Tipo: `string`
- Descripción: requerido cuando `account_owner_type = individual`.

### `last_name`
- Tipo: `string`
- Descripción: requerido cuando `account_owner_type = individual`.

### `business_name`
- Tipo: `string`
- Descripción: requerido cuando `account_owner_type = business`.

### `deactivation_reason`
- Tipo: `enum<string>`
- Descripción: motivo de desactivación si la cuenta externa está inactiva.
- Valores visibles:
  - `plaid_item_error`
  - `deactivated_due_to_bounceback`
  - `deleted_by_developer`
  - `requested_by_developer`
  - `invalid_account_number`
  - `invalid_bank_validation`
  - `rejected_by_bank_provider`

### `deactivation_details`
- Tipo: `string`
- Descripción: detalles adicionales sobre la desactivación.

---

## 13) Validaciones y restricciones importantes

### Sobre `account_owner_name`
La doc indica que para transferencias **ACH o wire** este campo debe cumplir reglas adicionales de formato y longitud:

- mínimo efectivo: al menos 3 caracteres para esos casos
- máximo efectivo: 35 caracteres para esos casos
- además debe cumplir patrones regex específicos según ACH o wire

Aunque la definición general del campo dice `1 - 256`, Bridge documenta estas restricciones operativas adicionales para ACH/wire en la respuesta del objeto.

### Sobre la dirección del beneficiario
Para cuentas US, Bridge deja claro que una dirección válida del beneficiario es importante y expone el campo `beneficiary_address_valid` en la respuesta.

### Sobre idempotencia
Como `Idempotency-Key` es obligatorio, debes generar una clave única por operación lógica de creación. Si reintentas la misma operación por timeout o error transitorio, reutiliza la misma clave para evitar duplicados.

---

## 14) Qué enviar como mínimo

Si quieres una lista directa de lo que debes enviar sí o sí para el caso documentado **US**:

- `customerID` en la URL
- header `Api-Key`
- header `Idempotency-Key`
- `account_owner_name`
- `account_type = "us"`
- `currency = "usd"`
- `account.account_number`
- `account.routing_number`
- `account.checking_or_savings`

### Muy recomendable además
- `bank_name`
- `address.street_line_1`
- `address.city`
- `address.state`
- `address.postal_code`
- `address.country`

---

## 15) Resumen ejecutivo

Para crear una cuenta externa en Bridge, en el caso visible de la documentación debes llamar a:

```http
POST /v0/customers/{customerID}/external_accounts
```

autenticándote con `Api-Key` y usando `Idempotency-Key`.

El flujo documentado con más detalle corresponde a una **cuenta bancaria US** y pide esencialmente:
- titular,
- tipo de cuenta (`us`),
- moneda (`usd`),
- datos bancarios dentro del objeto `account`.

Bridge devuelve un objeto de cuenta externa con:
- `id`,
- `customer_id`,
- datos básicos de la cuenta,
- estado `active`,
- timestamps,
- y validación de dirección del beneficiario.

---

## 16) Observación importante sobre el alcance del reporte

Este reporte está construido con base en la **documentación pública visible** de la página indicada. La misma página enumera múltiples variantes de external account (IBAN, SWIFT, CLABE, Pix, FPS, Bre-B), pero no despliega en esta vista todos los subcampos detallados de cada una.

Por eso, el contenido de este reporte está enfocado principalmente en la variante **US / ACH-Wire**, que es la que sí aparece detallada en el ejemplo de request/response visible.

Si después quieres, puedo prepararte una **segunda versión del mismo reporte** enfocada a:
- DTO para NestJS,
- validaciones con `class-validator`,
- servicio con `HttpService`/Axios,
- manejo de errores Bridge,
- e idempotencia bien implementada en backend.
