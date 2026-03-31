# 📋 Índice — Flujo Completo de Transacciones y Transfers

> **Versión:** 1.0.0
> **Generado desde:** backend_Guira (NestJS + Supabase + Bridge API)
> **Fecha:** 2026-03-31
> **Base URL Guira:** `https://api.guira.app/v1`
> **Base URL Bridge:** `https://api.bridge.xyz/v0`

Este módulo documenta **el ciclo de vida completo de una transacción** (Transfer) dentro de la plataforma Guira, desde que el usuario solicita un envío de dinero hasta que se confirma su liquidación, incluyendo los endpoints de Bridge API utilizados internamente.

---

## 📑 Documentos en esta Carpeta

| # | Documento | Descripción |
|:---:|:---|:---|
| 01 | [Visión General del Flujo](./01_VISION_GENERAL_FLUJO.md) | Diagrama completo paso a paso del ciclo de vida de una transacción con toda la cadena de eventos. |
| 02 | [Endpoints Guira (API Interna)](./02_ENDPOINTS_GUIRA_INTERNOS.md) | Todos los endpoints de Guira que el frontend consume para crear, consultar y administrar los payouts/transfers. |
| 03 | [Endpoints Bridge (API Partner)](./03_ENDPOINTS_BRIDGE_API.md) | Los endpoints de Bridge API que Guira llama internamente (server-to-server) para ejecutar las transferencias. |
| 04 | [Estados y Transiciones de un Transfer](./04_ESTADOS_TRANSFER.md) | Máquina de estados completa de un Transfer en Bridge y cómo se mapea a las tablas de Guira. |
| 05 | [Webhooks de Transfers](./05_WEBHOOKS_TRANSFERS.md) | Eventos webhook que Bridge envía a Guira durante el ciclo de vida de un transfer y cómo se procesan. |
| 06 | [Errores y Casos Límite](./06_ERRORES_Y_EDGE_CASES.md) | Manejo de errores, reversiones de saldo, timeouts y casos edge del flujo transaccional. |

---

## 🧩 Relación con Otros Flujos

```
┌────────────────────────┐
│  01. Onboarding (KYC)  │ ← Primero se aprueba al usuario
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│  02. Wallets & Funding │ ← Se crea wallet y se fondea vía VA
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│  03. External Accounts │ ← Se registra cuenta bancaria destino
└──────────┬─────────────┘
           ▼
┌══════════════════════════════════════════════════════════════╗
║  04. TRANSACCIONES / TRANSFERS (← ESTÁS AQUÍ)              ║
║  El usuario envía dinero desde su wallet hacia una cuenta   ║
║  externa usando Bridge como orquestador de pagos.           ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 🔑 Conceptos Clave

| Concepto | Definición |
|:---|:---|
| **Transfer** | Objeto en Bridge que representa el movimiento de fondos de un origen (source) a un destino (destination). |
| **Payout** | Término de Guira para un retiro: sacar fondos de la wallet interna hacia una cuenta bancaria externa. |
| **Payout Request** | Registro en la BD de Guira (`payout_requests`) que envuelve al Transfer de Bridge con lógica de negocio adicional (fees, compliance, reservas). |
| **Ledger Entry** | Asiento contable en el libro mayor de Guira. Todo movimiento de dinero genera un débito o crédito en esta tabla. |
| **Reserve Balance** | Monto congelado/apartado durante el procesamiento de un payout para evitar condiciones de carrera. |
| **Payment Rail** | El "carril de pago" o medio de transporte del dinero: `ach`, `wire`, `sepa`, `spei`, `ethereum`, `polygon`, etc. |
