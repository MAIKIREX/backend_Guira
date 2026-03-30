# Depósitos y Fondeo (Vía Webhooks Bridge)

> **Descripción:** Este flujo es **100% automatizado, asíncrono y en background**. Explica qué ocurre dentro de Guira cuando un tercero (o el mismo cliente) realiza una transferencia bancaria (ACH/Wire) hacia el número de cuenta y ruta de la **Cuenta Virtual** generada anteriormente.
> **Módulo:** `WebhooksService` (`/webhooks` endpoint + CRON processing).

---

## 🚦 Precondiciones (El Trigger)

El cliente comparte sus instrucciones bancarias (Account Number: `123456...`, Routing Number: `0840...`, Bank: `Evolve Bank`). Alguien transfiere $1,000 USD hacia esa cuenta a través de la red bancaria. Bridge la recibe, realiza la conciliación y dispara un webhook a nuestro servidor a la ruta `/webhooks/bridge`.

---

## 👣 Pasos del Flujo Interno

El webhook de Bridge procesa la información de la siguiente manera:

### 1. Recepción y Encolamiento Rápido (`webhook sink`)
El Controller de webhooks almacena de manera síncrona el payload bruto (raw payload) en la tabla `webhook_events` con `status = 'pending'` y responde inmediatamente a Bridge API con un `200 OK`. 
Esto previene timeouts y problemas de latencia mutua.

### 2. CRON Processing Background Job
Cada 30 segundos, el proceso decorado por `@Cron('*/30 * * * * *')` lee eventos pendientes en la tabla `webhook_events`. Evalúa la firma de HMAC SHA256 proveniente del `x-bridge-signature` para confirmar que el evento es auténcico, no duplicado ni falsificado.

### 3. Dispatch de `virtual_account.funds_received`
El payload entrante indica un depósito fiat recibido:

```json
// Payload interno de ejemplo (Raw de Bridge)
{
  "event_type": "virtual_account.funds_received",
  "id": "evt_123456",
  "data": {
    "virtual_account_id": "va_123456789",
    "amount": "1000.00",
    "currency": "usd",
    "sender_name": "John Doe LLC"
  }
}
```

### 4. Flujo Financiero Contable (`handleFundsReceived`)

Cuando el webhook es procesado, el motor interno de Guira ejecuta las siguientes acciones de negocio:

1. **Acreditación del Evento:**
   - Se guarda el evento puente real en la base de datos dentro de `bridge_virtual_account_events` relacionado a ese `va_123456789`.
2. **Cálculo de Comisiones (Fees):**
   - El sistema extrae el `developer_fee_percent` configurado internamente. Supongamos que es del **1.0%**.
   - **Fee:** $10.00 USD.
   - **Net Amount (Fondo real neto):** $990.00 USD.
3. **Generación de `payment_orders`:**
   - Registra una nueva orden en `payment_orders` de donde salió el dinero (`bridge_virtual_account`), guardando quién lo mandó (`sender_name`), por valor bruto y neto, poniéndola como `completed`.
4. **Impacto al Libro Mayor (`ledger_entries`):**
   - Aquí surge la magia de doble contabilidad: Se genera un **CRÉDITO (Abono)** a la ID de la billetera destino del usuario en la tabla `ledger_entries` por importe de **$990.00 USD** con estado **SETTLED** (Liquidado).
   - *¿Por qué el balance sube?* Al crear el registro en la tabla ledger como `settled`, un trigger de PostgreSQL existente a nivel de Base de Datos es el responsable directo de incrementar `balances.available_amount` y `balances.amount` en tiempo real. 
5. **Notificación Push / Activity Log:**
   - Se crea una alerta en `notifications` donde el usuario recibe *"Recibiste $990.00"* y una bitácora en `activity_logs` ("DEPOSIT_RECEIVED").

---

## 📊 Estado Final de Balance Tras Flujo

Si este usuario tenía `$0.00` de disponibilidad:

| Tabla de Base de Datos | Cambio Recibido |
| :--- | :--- |
| `balances` | `amount` cambia a **`990.00`**, `available_amount` a **`990.00`** |
| `payment_orders` | Nuevo registro de deposito por `$1,000.00` (-`$10` tarifa de cobro). |
| `ledger_entries` | Entrada de Crédito Settled de `$990.00`. |
| `webhook_events` | Estado marca a `processed`. |

El cliente ya puede retirar o usar estos fondos inmediatamente en el flujo de pagos u operadores de Payout.
