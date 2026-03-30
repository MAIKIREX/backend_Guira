# Creación de Cuentas Virtuales (Virtual Accounts)

> **Descripción:** Una vez que el usuario ha completado su Onboarding (KYC/KYB) y su perfil está en `approved`, puede crear **Cuentas Virtuales (Virtual Accounts - VAs)**. Estas cuentas proporcionan instrucciones bancarias locales reales (Ej. un número de cuenta y de ruta en un banco asociado de EE. UU.) para recibir depósitos fiat.
> **Módulo:** `BridgeController` -> `/bridge/virtual-accounts`

---

## 🚦 Precondiciones

1. El usuario debe estar autenticado (`Authorization: Bearer <token>`).
2. El perfil debe tener `onboarding_status = 'approved'`.
3. El perfil debe contar con un `bridge_customer_id` y no estar congelado o inactivo.

---

## 👣 Pasos del Flujo

### 1. Crear una Cuenta Virtual (Recepción de Depósitos)

Genera las instrucciones de depósito. Guira se comunica con Bridge API para aprovisionar un número de ruta (routing number) y número de cuenta (account number) en nombre del cliente.

- **Método:** `POST`
- **Endpoint:** `/bridge/virtual-accounts`
- **Autenticación requerida:** Sí

#### 📥 Body Request
```json
{
  "source_currency": "usd",
  "destination_currency": "usdc",
  "destination_payment_rail": "polygon",
  "destination_wallet_id": "uuid-de-la-wallet-activa"
}
```
*Si `destination_wallet_id` se omite, el sistema no forzará un destino (aunque Bridge lo administrará internamente).*

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "id": "uuid-de-la-virtual-account-en-guira",
  "user_id": "uuid-del-usuario",
  "bridge_virtual_account_id": "va_123456789",
  "bridge_customer_id": "cust_123456789",
  "source_currency": "usd",
  "destination_currency": "usdc",
  "destination_payment_rail": "polygon",
  "destination_address": "0xABC123...",
  "destination_wallet_id": "uuid-de-la-wallet-activa",
  "bank_name": "Evolve Bank & Trust",
  "account_number": "123456789012",
  "routing_number": "084001554",
  "status": "active",
  "created_at": "2026-03-29T10:00:00Z"
}
```

> [!NOTE]
> Con esta respuesta, el frontend puede mostrarle al usuario su **Account Number** y **Routing Number** para que otros le transfieran a través de ACH o Wire en Estados Unidos.

---

### 2. Listar Cuentas Virtuales Activas

Permite al usuario visualizar todas sus cuentas virtuales activas para mostrar la información en la UI (Ej. "Mis Cuentas de Recaudo").

- **Método:** `GET`
- **Endpoint:** `/bridge/virtual-accounts`
- **Autenticación requerida:** Sí

#### 📤 Respuesta Exitosa (200 OK)
```json
[
  {
    "id": "uuid-de-la-virtual-account",
    "bank_name": "Evolve Bank & Trust",
    "account_number": "123456789012",
    "routing_number": "084001554",
    "source_currency": "usd",
    "status": "active"
  }
]
```

---

### 3. Obtener Detalle de una Cuenta Virtual

Muestra información detallada de una cuenta específica seleccionada.

- **Método:** `GET`
- **Endpoint:** `/bridge/virtual-accounts/{id}`
- **Autenticación requerida:** Sí

---

### 4. Desactivar una Cuenta Virtual

Si el usuario ya no necesita esa cuenta o requiere generar una nueva por seguridad. Se elimina y devuelve estado `inactive` en la tabla de la base de datos de Guira y es borrada también de Bridge.

- **Método:** `DELETE`
- **Endpoint:** `/bridge/virtual-accounts/{id}`
- **Autenticación requerida:** Sí

#### 📤 Respuesta Exitosa (200 OK)
```json
{
  "message": "Cuenta virtual desactivada"
}
```
---

## 🚫 Posibles Errores

| Error | Mensaje Retornado | Explicación |
| :--- | :--- | :--- |
| **400 Bad Request** | `Ya tienes una cuenta virtual activa para usd` | Actualmente Guira limita a una cuenta virtual activa por moneda de origen (`source_currency`) para evitar spam de generación. |
| **403 Forbidden** | `Cuenta inactiva` o `Cuenta congelada` | Prevención por parte de administración por riesgos. |
| **400 Bad Request** | `Onboarding incompleto. Completa la verificación...` | El usuario intentó crear la VA antes de ser aprobado. |
