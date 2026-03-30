# Estados del Sistema y Máquina de Estados

Esta tabla describe los estados clave del `onboarding_status` del usuario y su expediente. Transiciones y qué causa su movimiento.

## Estados del Perfil (`profiles.onboarding_status`)

1. **`pending`**: Al registrarse.
2. **`kyc_started`** o **`kyb_started`**: Al crear la solicitud en el endpoint `/application`.
3. **`in_review`**: Al presionar Submit (`PATCH /submit`). Entra en revisión por el staff.
4. **`approved`**: El staff lo aprueba mediante admin panel.
5. **`rejected`**: El staff rechaza de manera permanente.
6. **`needs_review`**: El staff solicita documentos/cambios extra; el usuario puede volver a hacer Submit.

---

## Activaciones Automáticas Tras Aprobación

> [!IMPORTANT]
> Cuando el analista aprueba el expediente (KYC o KYB), el sistema dispara un evento automatizado súper importante:

1. Modifica los estados locales a `approved`.
2. Llama a `BridgeCustomerService.registerCustomerInBridge(...)`.
3. Esto envía los datos estructurados a Bridge API (`POST /v0/customers` de Bridge).
4. El backend recibe el ID del customer en Bridge y lo almacena como `bridge_customer_id` en el perfil del usuario.
5. Se **crea la Wallet principal USD automáticamente**.
6. Se **inicializa la cuenta de balance (0 USD)** y permite el acceso instantáneo al pago y fondeo.

---

## Payloads Estructurados hacia Bridge API

Así es como Guira integra la información validada con el sponsor bancario Bridge:

### Para Individuos (KYC)
```json
{
  "type": "individual",
  "first_name": "María",
  "last_name": "González",
  "email": "maria@ejemplo.com",
  "date_of_birth": "1990-05-15",
  "address": {
    "street": "Av. Reforma 123",
    "city": "Ciudad de México",
    "state": "CDMX",
    "postal_code": "06600",
    "country": "MX"
  }
}
```

### Para Empresas (KYB)
```json
{
  "type": "business",
  "name": "Guira Payments S.A. de C.V.",
  "email": "contacto@guirapay.com",
  "tax_identification_number": "GPY1234567A0",
  "address": {
    "street": "Av. Vallarta 3000",
    "city": "Guadalajara",
    "country": "MX"
  },
  "representatives": [
    {
      "first_name": "Carlos",
      "last_name": "Slim",
      "title": "CEO"
    }
  ]
}
```
