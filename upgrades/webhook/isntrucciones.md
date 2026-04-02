Sí, y aquí lo importante es separar dos cosas:

1. **crear el webhook en Bridge**, y
2. **preparar tu backend para recibirlo de forma segura**.

Para que tu backend tenga comunicación con Bridge por webhooks, **necesitas ambas partes**. Bridge no “abre” una conexión persistente contigo; lo que hace es **enviarte solicitudes HTTP POST** a una URL tuya cada vez que ocurre un evento. ([Bridge][1])

## Qué necesitas sí o sí

### 1) Una URL pública HTTPS de tu backend

Al crear el webhook, Bridge te pide un campo `url` obligatorio. Esa URL:

* debe usar **HTTPS**,
* debe tener un **certificado X.509 válido**,
* y el host debe ser **alcanzable** por Bridge. ([Bridge][2])

Eso significa que una URL como `http://localhost:3000/webhooks/bridge` **no sirve** para producción real, porque `localhost` no es accesible desde Internet y además no cumple con HTTPS válido. Esto se deduce directamente de los requisitos de Bridge para la URL. ([Bridge][2])

En la práctica, tu backend debería exponer algo como:

```txt
https://tu-dominio.com/webhooks/bridge
```

---

### 2) Tu API key de Bridge

Para registrar el endpoint en Bridge debes hacer un `POST /v0/webhooks` y enviar el header `Api-Key`. También debes mandar un `Idempotency-Key`. Ambos son requeridos. ([Bridge][2])

Ejemplo oficial base:

```bash
curl --request POST \
  --url https://api.bridge.xyz/v0/webhooks \
  --header 'Api-Key: <api-key>' \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: <idempotency-key>' \
  --data '{
    "url": "https://tu-dominio.com/webhooks/bridge",
    "event_epoch": "webhook_creation",
    "event_categories": [
      "customer",
      "kyc_link",
      "transfer"
    ]
  }'
```

`event_epoch` también es obligatorio. Bridge indica que normalmente debe ser `"webhook_creation"`, salvo que quieras procesar eventos desde antes de crear el webhook, en cuyo caso existe `"beginning_of_time"`. ([Bridge][2])

---

### 3) Elegir qué eventos quieres recibir

En `event_categories` defines las categorías de eventos que tu webhook escuchará. Bridge documenta, entre otras, estas categorías:

* `customer`
* `kyc_link`
* `liquidation_address.drain`
* `static_memo.activity`
* `transfer`
* `virtual_account.activity`
* `card_account`
* `card_transaction`
* `card_withdrawal`
* `posted_card_account_transaction`
* `external_account` ([Bridge][2])

Si tu flujo está enfocado en onboarding, cuentas externas, cuentas virtuales y movimientos, normalmente te interesarán sobre todo:

* `customer`
* `kyc_link`
* `external_account`
* `virtual_account.activity`
* `transfer`

---

### 4) Guardar el `public_key` que te devuelve Bridge

Cuando creas el webhook, Bridge responde con algo como:

* `id`
* `url`
* `status`
* `public_key`
* `event_categories` ([Bridge][2])

Ese `public_key` **es crítico**. Bridge dice explícitamente que esa clave pública en formato PEM es la que debes usar para **verificar la autenticidad** de los eventos recibidos. ([Bridge][2])

No es un detalle opcional. Sin esa verificación, tu endpoint estaría aceptando POSTs sin comprobar que realmente vienen de Bridge.

---

### 5) Implementar el endpoint receptor en tu backend

Tu backend debe tener una ruta `POST` que reciba el JSON del evento. Cuando el webhook está `active`, Bridge envía los eventos con:

* método **POST**
* `Content-Type: application/json` ([Bridge][1])

Por ejemplo, en NestJS podrías tener algo conceptualmente así:

```ts
POST /webhooks/bridge
```

Ese endpoint debe hacer 4 cosas:

1. leer el **body crudo** de la petición,
2. leer el header `X-Webhook-Signature`,
3. verificar la firma con el `public_key`,
4. si es válido, procesar el evento y responder **200** rápido. ([Bridge][3])

Bridge recomienda devolver **200 lo más rápido posible** para evitar timeouts y reintentos. ([Bridge][1])

---

## La parte más importante: validación de firma

Bridge envía un header:

```txt
X-Webhook-Signature: t=<timestamp>,v0=<base64 encoded signature>
```

y documenta este flujo de validación:

1. extraer `timestamp` y `signature` del header,
2. unir `timestamp + "." + raw_http_request_body`,
3. generar un digest `SHA256`,
4. decodificar la firma base64,
5. verificar la firma usando:

   * la **public key** del webhook,
   * el digest calculado,
   * la firma decodificada. ([Bridge][3])

Además, Bridge recomienda rechazar eventos demasiado antiguos, por ejemplo de más de **10 minutos**, para evitar replay attacks. Si son demasiado viejos, recomienda responder **400** para provocar retry. En cada retry Bridge genera un nuevo timestamp. ([Bridge][3])

### Ojo técnico importante

La validación usa el **raw body**, no el body ya parseado/modificado. ([Bridge][3])

Eso en NestJS importa mucho, porque si parseas primero el JSON y luego reconstruyes el texto, la firma puede no coincidir. En otras palabras: **debes capturar el body original tal como llegó**.

---

## Estado del webhook: por qué no empieza activo

Bridge indica que los webhooks nuevos se crean en estado **`disabled`**. No empiezan enviando eventos automáticamente. Luego puedes habilitarlos con `PUT /webhooks/{webhookID}` cambiando `status` a `active`. ([Bridge][2])

Eso es bueno porque el flujo correcto es:

1. crear webhook en `disabled`,
2. implementar y probar tu receptor,
3. verificar firmas,
4. hacer pruebas con envío/manual/logs,
5. recién después activarlo. ([Bridge][1])

---

## Flujo completo recomendado para tu backend

## Paso 1. Tener backend accesible desde Internet

Necesitas desplegar tu backend en una VPS, Render, Railway, Fly.io, un servidor con Nginx, o similar, siempre con HTTPS válido. Esto es consecuencia directa de que Bridge exige URL HTTPS alcanzable con certificado válido. ([Bridge][2])

## Paso 2. Crear la ruta receptora

Ejemplo lógico:

```txt
POST /webhooks/bridge
```

## Paso 3. Crear el webhook en Bridge

Con tu `Api-Key`, `Idempotency-Key`, `url`, `event_epoch` y `event_categories`. ([Bridge][2])

## Paso 4. Guardar estos datos en tu sistema

Del response guarda como mínimo:

* `id` del webhook
* `public_key`
* `status`
* categorías configuradas ([Bridge][2])

## Paso 5. Implementar verificación de firma

Tu endpoint debe:

* leer `X-Webhook-Signature`,
* validar timestamp,
* generar digest del `timestamp.rawBody`,
* verificar con `public_key`. ([Bridge][3])

## Paso 6. Procesar eventos

Bridge publica eventos estructurados con campos como:

* `api_version`
* `event_id`
* `event_category`
* `event_type`
* `event_object`
* `event_object_changes`
* `event_created_at` ([Bridge][4])

Entonces en tu backend normalmente harías algo como:

* si `event_type` = cambio de KYC → actualizar estado del usuario
* si `event_type` = transferencia actualizada → actualizar estado de transacción
* si `event_type` = actividad de virtual account → registrar depósito, etc.

## Paso 7. Responder rápido

Si el evento es válido, responde `200` rápido y procesa con lógica robusta. Bridge reintenta con exponential backoff por hasta **dos días** si tu endpoint no está disponible. ([Bridge][1])

## Paso 8. Activar el webhook

Cuando ya funcione, haces `PUT /v0/webhooks/{webhookID}` con `status: "active"`. ([Bridge][5])

---

## Qué pasa si estás en local

Bridge documenta que la URL debe ser HTTPS válida y alcanzable. Entonces, en local puro, **Bridge no podrá llamarte directamente**. ([Bridge][2])

Para pruebas reales necesitas una de estas dos opciones:

* desplegar tu backend a Internet con dominio HTTPS válido, o
* usar un túnel HTTPS público hacia tu máquina local.

Lo primero es lo más limpio para una integración estable.

---

## Limitaciones importantes de Bridge

Hay dos detalles que debes considerar:

* puedes tener un máximo de **5 webhooks** entre activos o deshabilitados;
* en **Sandbox** puedes crear webhooks, pero **no se enviarán eventos**. ([Bridge][2])

Ese segundo punto es clave: aunque el registro exista en sandbox, no debes esperar tráfico real automático desde ahí. ([Bridge][2])

---

## Qué deberías guardar en variables de entorno

En tu backend yo separaría esto:

```env
BRIDGE_API_KEY=sk_...
BRIDGE_WEBHOOK_ID=wep_...
BRIDGE_WEBHOOK_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
BRIDGE_WEBHOOK_URL=https://tu-dominio.com/webhooks/bridge
```

El `public_key` no es secreto como una private key, pero sí conviene tratarlo como configuración controlada para no perder consistencia con cada webhook creado. Esto se infiere del flujo oficial donde Bridge te devuelve una clave pública por endpoint para verificación. ([Bridge][2])

---

## Qué tendría que hacer tu backend en NestJS, resumido

Tu backend necesita:

* un endpoint `POST /webhooks/bridge`
* acceso al **raw body**
* lectura de `X-Webhook-Signature`
* verificación RSA/SHA256 con la `public_key`
* validación de antigüedad del timestamp
* parser del evento JSON
* lógica por `event_category` y `event_type`
* respuesta `200` rápida
* logs de auditoría y deduplicación por `event_id` para no procesar dos veces el mismo evento; esto último es una buena práctica de integración basada en la estructura del evento que incluye `event_id`. ([Bridge][4])

---

## En palabras simples

Para que Bridge “hable” con tu backend, necesitas esto:

* **tu backend publicado en HTTPS**
* **crear el webhook en Bridge**
* **guardar la public key**
* **validar la firma de cada evento**
* **activar el webhook**
* **procesar los eventos recibidos**

Sin una URL pública HTTPS válida, no hay comunicación real. Sin validación de firma, no hay seguridad real. Y sin activar el webhook, no recibirás eventos automáticos. ([Bridge][2])

En el siguiente paso te puedo bajar esto a algo ya implementable para **NestJS**, con estructura de controlador, captura de raw body y función de verificación de firma.

[1]: https://apidocs.bridge.xyz/platform/additional-information/webhooks/overview?utm_source=chatgpt.com "Webhooks - Bridge"
[2]: https://apidocs.bridge.xyz/api-reference/webhooks/create-a-webhook-endpoint "Create a webhook endpoint - Bridge"
[3]: https://apidocs.bridge.xyz/platform/additional-information/webhooks/signature?utm_source=chatgpt.com "Webhook event signature verification"
[4]: https://apidocs.bridge.xyz/platform/additional-information/webhooks/structure?utm_source=chatgpt.com "Event structure"
[5]: https://apidocs.bridge.xyz/api-reference/webhooks/update-a-webhook?utm_source=chatgpt.com "Update a webhook"
