# Registrar Cuentas Bancarias Destino (External Accounts)

> **Descripción:** Antes de que un usuario pueda extraer fondos de la wallet (hacer un Payout / Retiro), necesita registrar la cuenta bancaria de destino (External Account). Estas cuentas también se sincronizan con Bridge API.
> **Módulo:** `BridgeController` -> `/bridge/external-accounts`

---

## 🚦 Precondiciones

1. Autenticación Bearer Token válida.
2. Estado de onboarding `approved` en Guira (y en Bridge).

---

## 👣 Pasos del Flujo

### 1. Registrar Cuenta Destino

El cliente guarda una nueva cuenta mediante el endpoint indicando la metodología y carril de pago (Payment Rail). Puede ser ACH, Wire, SEPA, o SPEI. Dependiendo del raíl de pago dictaminará lo que se le solicite enviar en el JSON Payload.

- **Método:** `POST`
- **Endpoint:** `/bridge/external-accounts`
- **Autenticación requerida:** Sí

#### 📥 Body Request (Ejemplo para ACH/Wire de EE.UU.)
```json
{
  "bank_name": "Chase Bank",
  "account_name": "Empresa LLC u Hombre",
  "currency": "usd",
  "payment_rail": "ach",
  "account_type": "checking",
  "account_number": "987654321098",
  "routing_number": "122000247",
  "country": "US"
}
```

#### 📥 Body Request (Ejemplo para SEPA Europeo)
```json
{
  "bank_name": "Santander EU",
  "account_name": "Empresa LLC u Hombre",
  "currency": "eur",
  "payment_rail": "sepa",
  "iban": "ES4512345678901234567890",
  "swift_bic": "BOTKESMM",
  "country": "ES"
}
```

#### 📤 Respuesta Exitosa (201 Created)
```json
{
  "id": "uuid-cuenta-externa-guira",
  "user_id": "uuid-del-usuario",
  "bridge_external_account_id": "ea_987654321",
  "bridge_customer_id": "cust_123456",
  "bank_name": "Chase Bank",
  "account_name": "Empresa LLC u Hombre",
  "account_last_4": "1098",
  "currency": "usd",
  "payment_rail": "ach",
  "is_active": true,
  "created_at": "2026-03-29T11:00:00Z"
}
```

> [!NOTE]
> Guira solo almacena de forma plana el `routing_number`, el tipo y los últimos 4 dígitos por seguridad (`account_last_4`). Toda la información confidencial la consume el JSON de respuesta directo tras creársela a Bridge API.

---

### 2. Listar Cuentas Guardadas

El usuario carga su "Libreta de Contactos Bancarios" para seleccionar más tarde a qué cuenta enviar al hacer un pago.

- **Método:** `GET`
- **Endpoint:** `/bridge/external-accounts`

#### 📤 Respuesta Exitosa (200 OK)
```json
[
  {
    "id": "uuid-cuenta-externa-guira",
    "bank_name": "Chase Bank",
    "account_name": "Empresa LLC u Hombre",
    "account_last_4": "1098",
    "payment_rail": "ach",
    "currency": "usd",
    "is_active": true
  }
]
```

---

### 3. Eliminar / Desactivar

Soft-delete de la cuenta (no borrado físico). Para que ya no se listen al fondear.

- **Método:** `DELETE`
- **Endpoint:** `/bridge/external-accounts/{id}`

#### 📤 Respuesta Exitosa (200 OK)
```json
{
  "message": "Cuenta externa desactivada"
}
```
