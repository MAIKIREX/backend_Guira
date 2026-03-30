# Flujo de Creación de Wallets en Guira

Este documento detalla los pasos y los endpoints involucrados para que a un usuario se le aprovisione y asigne una "Wallet" en la plataforma Guira.

A diferencia de modelos manuales donde el usuario hace clic en "Crear Wallet", en Guira **la creación de la wallet base y sus balances ocurre de forma totalmente automatizada y asíncrona** una vez que el usuario ha completado satisfactoriamente el proceso de onboarding en Bridge.

---

## 1. Diagrama del Flujo Lógico

1. **El usuario completa su Onboarding** (firma de ToS y sumisión de datos).
2. **Bridge evalúa y aprueba** la aplicación KYC o KYB.
3. **Bridge dispara un webhook** de éxito hacia el backend de Guira.
4. **Guira recibe y encola** el webhook.
5. **Un proceso en background (Cron)** despacha el manejador de aprobación.
6. El sistema **actualiza el estado** del usuario a `approved`.
7. El sistema **crea las wallets y balances automáticamente** leyendo los parámetros y monedas admitidas para la aplicación (`SUPPORTED_WALLET_CONFIGS`).

---

## 2. Endpoints Involucrados Paso a Paso

### Fase 1: Desencadenante (Onboarding)
Estos endpoints inician el ciclo de revisión que derivará en la creación de la wallet:
- `PATCH /onboarding/kyc/application/submit`
- `PATCH /onboarding/kyb/application/submit`

### Fase 2: Receptor de Eventos (Webhook Sink de Bridge)
La señal de creación proviene desde el proveedor (Bridge) hacia este único endpoint:
- **Endpoint**: `POST /webhooks/bridge`
- **Privacidad**: PÚBLICO (pero protegido usando firma HMAC en la cabecera `x-bridge-signature`).
- **Evento clave**: Recibe un _payload_ donde `event_type` es `kyc_link.approved`.
- **Efecto**: Guarda el payload en una tabla (`webhook_events`) y responde rápidamente HTTP 200.

### Fase 3: Proceso Interno (Backend Cron Worker)
Aunque no es un endpoint expuesto, es donde ocurre la magia en `webhooks.service.ts`:
- Cada 30 segundos, NestJS procesa los webhooks pendientes.
- Al encontrar un `kyc_link.approved`, se enlaza el `bridge_customer_id` y se mandan a llamar las funciones internas para crear datos en las tablas:
  - `wallets` (Generada insertando las filas predeterminadas con tipo *bridge* ej. USDC en la red Ethereum).
  - `balances` (Se insertan filas asociadas para cada moneda soportada y un balance fiat base ej. USD. Todos inicializados en monto `0.00`).

### Fase 4: Confirmación en Cliente (Consumo en la App Frontend)
Tras ser notificado (vía Socket, Push o Reload), el frontend consultará la Wallet haciendo uso de los endpoints de lectura:

- **`GET /wallets`**
  - **Descripción**: Muestra el catálogo de wallets que le han sido aprovisionadas al usuario (id, moneda, nombre de la red, estado activo).
  
- **`GET /wallets/balances`**
  - **Descripción**: Muestra los saldos que tiene el usuario separados por moneda (USD, USDC, etc.). 
  - En la etapa inmediata posterior a su creación, todas muestran montos de `0.00`.

- **`GET /wallets/balances/:currency`**
  - **Descripción**: Sirve para solicitar e indagar sobre una moneda específica en vez de todo el arreglo (ej. `GET /wallets/balances/USDC`).

---

## 3. Extensiones (Cuentas Virtuales y Depósitos)

Adicionalmente, si bien la `Wallet` como contenedor de balances se crea sola, si el usuario requiere fondearla a través de una transferencia bancaria SPEI o Wire/ACH, debe crear una "Virtual Account". Para eso se requiere una llamada explícita:

- **`POST /bridge/virtual-accounts`**
  - **Uso**: El cliente hace la petición indicando en qué divisa va a originar el envío. 
  - **Resultado**: El endpoint contesta con un objeto con una CLABE Interbancaria o datos de banco americano con número de enrutamiento asignados a la persona o empresa, listos para fondear la nueva Wallet.
