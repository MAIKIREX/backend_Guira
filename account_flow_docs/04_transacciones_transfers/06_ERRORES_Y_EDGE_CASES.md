# Errores y Casos Límite (Edge Cases) del Flujo Transaccional

> **Descripción:** Manejo de errores, reversiones de saldo, timeouts, condiciones de carrera y escenarios excepcionales en el flujo de transacciones/transfers.

---

## 🚨 Categorías de Errores

### Categoría 1: Errores de Validación (Pre-Ejecución)

Estos errores ocurren **antes** de que se cree cualquier registro en Bridge. Son 100% controlados por Guira.

| Error | HTTP | Causa | Resolución |
|:---|:---:|:---|:---|
| Saldo insuficiente | `400` | `available_amount < (amount + fee)` | El usuario debe fondear su wallet o reducir el monto. |
| Límite excedido | `400` | Monto supera `transaction_limits` del tier KYC/KYB. | El usuario debe realizar un upgrade de verificación o enviar montos menores. |
| Cuenta externa no encontrada | `400` | El `bridge_external_account_id` no existe o `is_active = false`. | El usuario debe registrar una nueva cuenta externa. |
| Payment rail incompatible | `400` | El rail no es compatible con la moneda o el tipo de cuenta. Ej: querer enviar SPEI a una cuenta ACH. | Seleccionar un rail compatible. |
| Onboarding incompleto | `403` | `onboarding_status != 'approved'`. | Completar el proceso de verificación KYC/KYB. |
| Cuenta congelada | `403` | El perfil fue congelado por el equipo de compliance. | Contactar soporte. |
| Wallet inactiva | `403` | La wallet de origen está desactivada. | Contactar soporte. |

---

### Categoría 2: Errores de Ejecución (Durante Creación en Bridge)

Estos errores ocurren cuando Guira ya reservó el saldo pero la llamada a Bridge API falla.

| Error | Causa | Manejo |
|:---|:---|:---|
| **Timeout de Bridge API** | La petición `POST /v0/transfers` no responde en el tiempo configurado. | Gracias al `Idempotency-Key`, Guira puede reintentar la misma petición sin riesgo de duplicación. El saldo permanece reservado. |
| **Bridge retorna 400** | Datos inválidos para Bridge (ej. customer no aprobado, external account inválida en Bridge). | Guira libera el saldo reservado (`release_reserved_balance`), marca el payout como `failed` y notifica al usuario. |
| **Bridge retorna 500** | Error interno de Bridge. | Guira retiene la reserva y programa un reintento automático. Si falla 3 veces, escala a revisión manual. |
| **Bridge retorna 429 (Rate Limit)** | Demasiadas peticiones simultáneas a Bridge. | Guira aplica backoff exponencial y reintenta. |

#### Flujo de Rollback (Cuando Bridge falla post-reserva)

```
Reserve Balance ($502)
        │
        ▼
POST /v0/transfers ────── FALLA ──── Release Balance ($502)
                                          │
                                     available_amount += $502
                                     reserved_amount -= $502
                                          │
                                     payout_requests.status = 'failed'
                                          │
                                     notification: "Error al procesar pago"
```

---

### Categoría 3: Errores Post-Procesamiento (Bridge ya creó el Transfer)

Estos errores ocurren después de que Bridge aceptó el transfer pero algo falló durante su ejecución.

| Escenario | Estado Bridge | Acción Guira |
|:---|:---|:---|
| **Banco destino rechaza** (cuenta cerrada, fondos insuficientes del banco receptor, nombre no coincide) | `returned` | Libera `reserved_amount`. Marca como fallido. Código ACH de retorno incluido (ej. R02, R03, R04). |
| **Fondos no entregables** (dirección crypto inválida, cuenta bancaria no encontrada) | `undeliverable` | Bridge inicia refund automático. Guira espera webhook `refunded`. |
| **Error técnico de Bridge** (falla interna de procesamiento) | `error` | Escala a revisión manual. Saldo permanece reservado hasta resolución. |
| **Pago devuelto tardío** (el banco destino devuelve antes de 60 días para ACH) | `returned` | El saldo ya fue descontado (`settled`). Se genera un **crédito compensatorio** en ledger para devolver los fondos. |

---

## ⚡ Condiciones de Carrera (Race Conditions)

### Problema: Doble Gasto

**Escenario:** El usuario envía 2 solicitudes de payout simultáneamente, ambas por $500, cuando solo tiene $500 de saldo.

**Solución:** El stored procedure `reserve_balance` usa un `SELECT ... FOR UPDATE` en PostgreSQL que bloquea la fila del balance durante la transacción:

```sql
-- Pseudocódigo del Stored Procedure
BEGIN;
  SELECT available_amount 
  FROM balances 
  WHERE wallet_id = $1 
  FOR UPDATE;  -- ← LOCK de fila
  
  IF available_amount >= $amount THEN
    UPDATE balances 
    SET available_amount = available_amount - $amount,
        reserved_amount = reserved_amount + $amount;
    -- ÉXITO
  ELSE
    RAISE EXCEPTION 'Saldo insuficiente';
    -- FALLO: la segunda petición cae aquí
  END IF;
COMMIT;
```

La segunda solicitud espera a que la primera termine y al verificar el saldo lo encontrará insuficiente.

### Problema: Webhook Duplicado

**Escenario:** Bridge envía el mismo webhook 2 veces (por timeout o reintento).

**Solución:** Constraint `UNIQUE` en `webhook_events.bridge_event_id`:

```sql
INSERT INTO webhook_events (bridge_event_id, ...)
VALUES ('evt_transfer_001', ...)
ON CONFLICT (bridge_event_id) DO NOTHING;  -- ← Ignora silenciosamente
```

---

## 🔄 Mecanismo de Reintentos

### Reintentos de Creación en Bridge

| Intento | Espera (Backoff) | Acción |
|:---:|:---:|:---|
| 1 | 0 seg | Intento original. |
| 2 | 5 seg | Reintento con mismo `Idempotency-Key`. |
| 3 | 30 seg | Reintento final con mismo `Idempotency-Key`. |
| — | — | Si los 3 fallan: libera saldo, marca como `failed`, notifica al usuario y al equipo ops. |

### Reintentos de Procesamiento de Webhooks

| Intento | Espera | Acción |
|:---:|:---:|:---|
| 1 | 0 seg | CRON worker procesa el evento. |
| 2 | 30 seg | Si falló, el evento queda `pending` y el CRON lo reintenta. |
| 3 | 60 seg | Último reintento automático. |
| — | — | Tras 3 fallos: `webhook_events.status = 'failed'`. Alerta a equipo de operaciones. |

---

## 🏦 Códigos de Retorno ACH

Cuando un payout ACH es devuelto por el banco, Bridge incluye el código ACH de retorno:

| Código ACH | Significado | ¿Debe reintentar? |
|:---:|:---|:---:|
| R01 | Insufficient Funds (en la cuenta *destino*) | ❌ No |
| R02 | Account Closed | ❌ No — Eliminar cuenta externa |
| R03 | No Account / Unable to Locate Account | ❌ No — Datos incorrectos |
| R04 | Invalid Account Number | ❌ No — Corregir datos |
| R05 | Unauthorized Debit | ❌ No |
| R07 | Authorization Revoked | ❌ No |
| R08 | Payment Stopped | ❌ No |
| R10 | Customer Advises Not Authorized | ❌ No |
| R16 | Account Frozen | ❌ No |
| R20 | Non-Transaction Account | ❌ No |
| R29 | Corporate Customer Advises Not Authorized | ❌ No |

---

## 📋 Checklist de Validación Pre-Payout

Este es el orden exacto de validaciones que `createPayout` ejecuta antes de proceder:

```
✅ 1. ¿El usuario está autenticado?
✅ 2. ¿El perfil está approved (no congelado, no inactivo)?
✅ 3. ¿La wallet de origen existe y está activa?
✅ 4. ¿La cuenta externa destino existe y está activa?
✅ 5. ¿El payment_rail es compatible con la moneda y el destino?
✅ 6. ¿El Fee Service puede calcular la comisión?
✅ 7. ¿El available_amount >= (amount + fee)?
✅ 8. ¿El monto no excede los transaction_limits del tier?
✅ 9. ¿El reserve_balance RPC se ejecutó sin error?
✅ 10. ¿El payout_request se creó correctamente en BD?
✅ 11. ¿El monto supera el PAYOUT_REVIEW_THRESHOLD?
         → SÍ: Crear compliance_review, status = pending
         → NO: Ejecutar Bridge transfer inmediatamente
```

---

## 📊 Tabla de Impacto en Base de Datos por Escenario

| Escenario | `payout_requests` | `ledger_entries` | `bridge_transfers` | `balances` | `certificates` | `notifications` |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Payout exitoso** | `completed` | `settled` (DEBIT) | `payment_processed` | `reserved → 0` | ✅ Generado | "Pago completado" |
| **Payout rechazado por admin** | `cancelled` | — (no se creó) | — (no se creó) | `reserved → available` | ❌ | "Pago rechazado" |
| **Bridge retorna error** | `failed` | — | — | `reserved → available` | ❌ | "Error al procesar" |
| **Banco rechaza (returned)** | `failed` | `failed` (DEBIT) | `returned` | `reserved → available` | ❌ | "Pago devuelto" |
| **Reembolso exitoso** | `refunded` | `refunded` (DEBIT) | `refunded` | `reserved → available` | ❌ | "Fondos devueltos" |
| **Timeout de Bridge** | `pending` → reintento | — | — | Saldo reservado | ❌ | — |
