# 📦 Payment Orders — Documentación Completa

> **Tabla:** `public.payment_orders`  
> **Dominio:** Core Financiero (🟢 Verde)  
> **Última actualización:** 2026-03-31

---

## 📑 Índice de Documentos

| # | Archivo | Descripción |
|:---:|:---|:---|
| 01 | [Estructura y Schema](./01_ESTRUCTURA_Y_SCHEMA.md) | Columnas, tipos de datos, restricciones, relaciones FK y reglas RLS |
| 02 | [Estados y Transiciones](./02_ESTADOS_Y_TRANSICIONES.md) | Los 6 estados posibles, diagrama de máquina de estados, reglas de transición |
| 03 | [Caso A: Depósito Interno](./03_CASO_A_DEPOSITO_INTERNO.md) | Flujo completo cuando los fondos se quedan en la wallet de Guira |
| 04 | [Caso B: External Sweep](./04_CASO_B_EXTERNAL_SWEEP.md) | Flujo cuando los fondos van a wallet externa (Binance, MetaMask, etc.) |
| 05 | [Caso C: Liquidation Address](./05_CASO_C_LIQUIDATION_ADDRESS.md) | Flujo cuando el origen es una dirección de liquidación crypto |
| 06 | [Caso D: Depósito Manual/Ajuste](./06_CASO_D_DEPOSITO_MANUAL.md) | Operaciones manuales por Staff/Admin |
| 07 | [Relación con Ledger y Balances](./07_RELACION_LEDGER_BALANCES.md) | Cómo la payment_order genera entradas en el libro mayor y actualiza saldos |
| 08 | [Deduplicación e Idempotencia](./08_DEDUPLICACION_IDEMPOTENCIA.md) | Mecanismos para prevenir doble acreditación |

---

## 🎯 Resumen Ejecutivo

**`payment_orders`** es la tabla que registra **cada depósito confirmado** que ingresa a la plataforma Guira. Funciona como el **recibo estructurado** de un depósito antes de que se traduzca en movimientos contables (`ledger_entries`) y actualizaciones de saldo (`balances`).

### ¿Cuándo se crea una Payment Order?

| Trigger | Quién lo crea | Estado inicial |
|:---|:---|:---|
| Webhook `virtual_account.funds_received` (destino interno) | `WebhooksService.handleInternalDeposit()` | `completed` |
| Webhook `virtual_account.funds_received` (destino externo) | `WebhooksService.handleExternalSweepDeposit()` | `swept_external` |
| Webhook `liquidation_address.payment_completed` | `WebhooksService.handleLiquidationPayment()` | `completed` |
| Ajuste manual por Admin | Panel de administración | `pending` → `completed` |

### ¿Cuántos estados tiene?

**6 estados** definidos por CHECK constraint:

```
pending → processing → completed
                    → failed
                    → reversed
                    → swept_external
```

---

## 🔗 Cadena de Tablas Involucradas

```
webhook_events (raw sink)
    ↓ procesado por CRON Worker
bridge_virtual_account_events (log del evento VA)
    ↓
payment_orders ← ESTE DOCUMENTO
    ↓
ledger_entries (libro mayor contable)
    ↓ trigger PostgreSQL
balances (saldo en tiempo real)
    ↓
notifications (alerta al usuario)
```
