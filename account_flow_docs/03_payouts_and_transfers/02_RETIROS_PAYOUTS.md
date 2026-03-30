# Retiros, Transferencias y Payouts

> **Descripción:** Flujo para realizar envíos de dinero. Extraer balance interno de un `wallet` para ser dirigido hacia una Cuenta Bancaria Externa (External Account) de terceros (Pagos B2B/Pagos a Proveedores) o hacia una propia usando rieles fiat.
> **Módulo:** `BridgeController` -> `/bridge/payouts` & `/admin/bridge/payouts/...`

---

## 🚦 Precondiciones

1. Perfil debe estar `approved` (Onboarding completado).
2. Tener configurada en el sistema al menos una **External Account** para uso como destino.
3. El usuario debe poseer un saldo superior (`available_amount`) en su billetera base a lo intentado mandar (Valor + Fee transaccional).

---

## 👣 Pasos del Flujo B2B / Payout Remesa

### 1. Solicitar la Ejecución de un Pago (Payout)

El usuario selecciona su saldo en la Wallet, elije la cuenta destino y solicita enviar dinero fuera de la plataforma o realizar un egreso.

- **Método:** `POST`
- **Endpoint:** `/bridge/payouts`
- **Autenticación requerida:** Sí

#### 📥 Body Request
```json
{
  "wallet_id": "uuid-wallet-origen",
  "bridge_external_account_id": "uuid-cuenta-externa-guira",
  "amount": 500.00,
  "currency": "usd",
  "payment_rail": "ach",
  "business_purpose": "Pago a proveedor de inventario AWS",
  "notes": "Factura #INV-2993"
}
```

#### ⚙️ Proceso Interno de Guira (Punto Crítico Financiero):
El método de backend `createPayout` realiza controles draconianos y muy robustos a nivel código:
1. **Calcular Comisiones (Fee Service):** El servicio calcula cuánto cobrará a parte de ese egreso (Ej: envío ACH son $2 USD de fee). Por lo cual se intentarán de descontar y congelar un total **$502 USD**.
2. **Checar y Validar Saldo:** Verifica si `available_amount` soporta `$502 USD`. 
3. **Checar Límites KYC/KYB:** Revisa en la base de datos `transaction_limits`. Si supera un monto dictaminado (Ej: Límite único de transfer. $250.00), el paso se corta y lanza excepción `400 Bad Request`.
4. **Reserva de Saldo (`reserve_balance`):** Llama a un Stored Procedure RCP avanzado en Supabase donde bloquea directamente ese flujo del sistema para evitar doble manipulación de variables carrera. Mueve matemáticamente la variable `$502` de `available_amount` a su fila `reserved_amount`.
5. **Creación:** Genera en BD local el documento `payout_requests` con una status `= pending`.

#### 🚦 Flujo de Auto-Aprobación vs Threshold
Dependiendo de qué valor posea tu configuración de variables en App Config (`PAYOUT_REVIEW_THRESHOLD`), puede ocurrir 2 cosas en milisegundos tras lo anterior:
- **OPCIÓN A (Por debajo del threshold - Envío de Pequeño Valor):** La transferencia se envía inmediatamente hacia `BridgeService.executePayout()`, viaja la API del Partner y lo manda. Status local -> `processing`.
- **OPCIÓN B (Por encima del threshold - Monitoreo Manual):** Genera reporte de Compliance  `compliance_reviews` y no se envía. El payload devuelto expone `requires_review: true`. Queda retenido el saldo hasta que un staff de admin intervengan.

#### 📤 Respuesta (Si Opción A — Ejecutada Inmediato)
```json
{
  "payout_request_id": "uuid-de-la-solicitud-de-pago",
  "bridge_transfer_id": "tf_123456789",
  "status": "processing"
}
```

#### 📤 Respuesta (Si Opción B — Requiere Revisión AML)
```json
{
  "id": "uuid-de-la-solicitud-de-pago",
  "amount": 500,
  "fee_amount": 2,
  "status": "pending",
  "requires_review": true
}
```

---

### 2. Aprobación o Rechazo (Sólo Staff / Admin)

Si el umbral del pago detona las alarmas (`requires_review`: True), se habilita un circuito en el panel de administrador.

- **Aprobar:** `POST /admin/bridge/payouts/{id}/approve` -> Activa a Bridge, lanza pago final y se libera el dinero hacia cuenta destino. (Estado `processing`).
- **Rechazar:** `POST /admin/bridge/payouts/{id}/reject` -> Retorna saldo congelado desde `reserved_amount` hacia tu variable original en la Base de Datos `available_amount`. Cancela la petición en la base de datos local y el usuario no pierde dinero.

```json
// Body petición de rechazar:
{
  "reason": "Indicios de fraude detectados en el beneficiario según AML DB."
}
```

---

### 3. Ciclo de Vida hasta la Liquidación

Una vez que un Payout va a `processing`, el dinero ha sido procesado del lado de servidor, la API ha emitido la transferencia hacia fuera de la cuenta Virtual del Partner. De allí en más, el flujo de respuesta se controla a ciegas hasta recibir los Webhooks.

1. **Estado `processing`:** Genera un Débito Pendiente en la tabla `ledger_entries` (Estatus `pending`). *(En este punto el balance NO se ha restado definitivamente, sigue marcado como reservado en tu bolsa).*
2. **Webhook Recibido: `transfer.payment_processed`:** Actualiza el estado como procesado de nuestra tabla `bridge_transfers`.
3. **Webhook Recibido: `transfer.complete` (¡FINALIZACIÓN ÉXITOSA!):**
   - El Status del Ledger es cambiado de `pending` -> `settled` por Guira Webhook.
   - **El Trigger DB Mágico Sucede**: Resta en milisegundos reales el saldo que estaba en tu apartado `reserved_amount` a `0`. Confirmando que el dinero YA salió.
   - Tu pago Payout queda Finalizado `completed`.
   - Generación de un Certificado Transaccional en Base Datos tabla `certificates` (`CERT-2026-XyZ`). Notificando al cel o Email asociado "Pago Completado de $502 USD".

#### En el Raro Caso de Webhook `transfer.failed`:
La cuenta remota rebota su pago (Cuentas canceladas o sin soporte del banco de destino).
- Ledgers marcan `failed`.
- Regresan la reservación `reserved_amount` intacta de vuelta sumada para `available_amount` mediante proceso manual y script Stored Procedure `.rpc('release_reserved_balance')` . Nadie pierde su dinero.
