# Auditoría Técnica y Funcional: Flujo `bolivia_to_world` (1.1)

De acuerdo a la planificación detallada en `payment_orders.md` (Sección 1.1), se ha realizado una auditoría exhaustiva *(End-to-End)* del flujo **Bolivia → Mundo (Mediación PSAV)**, abarcando las capas de Frontend (`m-guira`), Backend (`nest-base-backend`), base de datos y la vista de administración/staff.

A continuación, los resultados y hallazgos.

---

## 1. Alineación Frontend - Backend

### ✅ Mapeo de Ruta y Payload
El formulario en el frontend utiliza la ruta conceptual `bolivia_to_exterior`. La utilidad `resolveFlowType` (en `payment-routes.ts`) mapea correctamente esta selección al valor esperado por el backend (`bolivia_to_world`), asegurando que ambos sistemas hablen el mismo idioma.

La construcción del payload se ejecuta impecablemente:
```typescript
case 'bolivia_to_world':
  payload.external_account_id = supplier?.bridge_external_account_id || supplier?.id || undefined;
  break;
```
El payload enviado a la API es limpio e incluye únicamente los campos permitidos y esperados por el DTO `CreateInterbankOrderDto`.

### ✅ Validación de Cuentas Externas (Bridge)
Existía una preocupación inicial respecto a cómo el backend obtenía los detalles bancarios (SWIFT/ACH). La auditoría ha confirmado que la arquitectura actual (híbrida con `suppliers`) es robusta:
1. Al crear un Proveedor Fiat (Supplier), el backend invoca a Bridge y crea simultáneamente un `bridge_external_account`.
2. El `id` de esa cuenta externa se almacena en la tabla de proveedores (`bridge_external_account_id`).
3. El frontend pasa ese `bridge_external_account_id` como parámetro principal (`external_account_id`) al vuelo de la orden de pago.
4. El backend autentica y cruza que este `external_account_id` realmente pertenezca al usuario en sesión antes de proceder con el registro de la orden. **Cumplimiento 100% de la regla de seguridad del DTO.**

### ⚠️ Hallazgo Menor: Esquema Zod en Frontend
El esquema `payment-order.schema.ts` exige validar campos como `swift_bank_name`, `swift_iban`, etc., si se selecciona el método *SWIFT* o *ACH*.
*   **Comportamiento actual:** El formulario autocompleta estos datos extraídos de la información del proveedor.
*   **Impacto de seguridad:** Ninguno. Aunque los campos se validan en UI, *no se inyectan* en el payload que viaja al backend (al backend solo le importa el `external_account_id`).
*   **Sugerencia (Opcional):** A futuro, la validación estricta de campos SWIFT/ACH en Zod para el flujo `bolivia_to_exterior` podría aligerarse a *solo lectura*, puesto que la responsabilidad de estos campos ya recae en la creación del "Proveedor".

---

## 2. Máquina de Estados (Lifecycle mediado por PSAV)

El flujo 1.1 requiere explícitamente mediación humana. Se verificó que toda la secuencia de `payment_orders.md` esté implementada en `payment-orders.service.ts` y orquestada por `staff.service.ts` a nivel frontend:

1.  **`created` → `waiting_deposit`**: El backend crea la orden con fee, exchange rates de `bob_usd` e inyecta las *Instrucciones de depósito* del PSAV automáticamente en la persistencia. ✅
2.  **`deposit_received` → `processing`**: Implementado con el endpoint de administración `POST /admin/payment-orders/:id/approve`. Fija la tasa de conversión final y la comisión (fee final). ✅
3.  **`processing` → `sent`**: Implementado vía `POST /admin/payment-orders/:id/mark-sent`. Exige que se pase la referencia o token de ejecución del PSAV (`tx_hash`). ✅
4.  **`sent` → `completed`**: Protegido. El endpoint `POST /admin/payment-orders/:id/complete` verifica que solo se complete subiendo un archivo, el cual el Staff sube primero al bucket `payment-receipts` en Supabase y luego enlaza su URL (`receipt_url`). ✅

---

## 3. Manejo de Limitaciones y Dependencias

*   **Límites Horarios y de Monto:** El servicio de pagos (`payment-orders.service.ts`) invoca exitosamente `validateRateLimit` y `validateAmountLimits` limitando la creación abusiva de expedientes.
*   **Tablas Base de PSAV:** La funcionalidad extrae dinámicamente las rutas bancarias asignadas (`getDepositAccount('bank_bo', 'BOB')`), mitigando el "hardcoding". Mientras existan cuentas parametrizadas para Bolivia en la tabla de operaciones, el flujo se mantiene ininterrumpible.
*   **Auditoría y Transparencia:** Todas las iteraciones (`approve`, `mark-sent`, `fail`, `complete`) guardan su huella técnica en `audit_logs` con `performed_by`, `previous_values` y `new_values`.

---

## 🚀 Conclusión Final

El flujo **`bolivia_to_world` (1.1)** **CUMPLE SUSTANCIALMENTE** con la planificación estricta del documento `payment_orders.md`. 

La arquitectura asíncrona liderada por el concepto *"Supplier === Virtual External Account"* funciona como eje clave para delegar en Bridge el fondeo final, cubriendo correctamente el ciclo de la orden de pago, desde que el cliente transfiere sus M/N bolivianos hasta que el departamento corporativo (Staff) sube el comprobante SWIFT. 

**Estado de la Auditoría:** APROBADA SIN REPAROS TÉCNICOS MAYORES.
