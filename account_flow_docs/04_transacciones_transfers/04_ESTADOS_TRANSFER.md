# Estados y Transiciones de un Transfer

> **Descripción:** Máquina de estados completa de un Transfer en Bridge API y cómo cada estado se mapea a las acciones y tablas internas de Guira.
> **Referencia Oficial:** [Transfer States — Bridge](https://apidocs.bridge.xyz/platform/orchestration/transfers/transfer-states)

---

## 🔄 Diagrama de Máquina de Estados

```
                              ┌───────────────────┐
                              │                   │
                              │  awaiting_funds   │ ← Estado inicial al crear el transfer
                              │                   │
                              └────────┬──────────┘
                                       │
                              Bridge recibe los fondos
                                       │
                              ┌────────▼──────────┐
                              │                   │
                         ┌────│  funds_received    │
                         │    │                   │
                         │    └────────┬──────────┘
                         │             │
                   (Revisión AML)    Bridge envía el pago
                         │             │
                ┌────────▼───┐ ┌──────▼───────────┐
                │            │ │                   │
                │  in_review │ │ payment_submitted │
                │            │ │                   │
                └────────┬───┘ └───────┬───────────┘
                         │             │
                   Aprobado por      El banco procesa
                   compliance          el pago
                         │             │
                         └──────┬──────┘
                                │
                       ┌────────▼──────────┐
                       │                   │
                       │ payment_processed │ ← ✅ ESTADO FINAL EXITOSO
                       │                   │
                       └───────────────────┘


  ════════════════ ESTADOS DE EXCEPCIÓN (desde cualquier punto) ════════════════

  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐  ┌─────────┐
  │  canceled   │  │   error     │  │  undeliverable    │  │ returned│
  └─────────────┘  └─────────────┘  └───────┬───────────┘  └────┬────┘
                                            │                    │
                                    ┌───────▼───────────┐       │
                                    │ refund_in_flight  │◄──────┘
                                    └───────┬───────────┘
                                            │
                                   ┌────────▼──────────┐
                                   │     refunded      │
                                   └───────────────────┘
                                            │
                                   (si falla el refund)
                                            │
                                   ┌────────▼──────────┐
                                   │  refund_failed    │
                                   └───────────────────┘
```

---

## 📊 Tabla de Estados Completa

### Estados del Flujo Feliz (Happy Path)

| # | Estado Bridge | Descripción | Acción en Guira |
|:---:|:---|:---|:---|
| 1 | `awaiting_funds` | Transfer creado. Bridge espera recibir los fondos del source. | Guira crea `bridge_transfers` con este estado. Ledger entry `DEBIT pending`. |
| 2 | `funds_received` | Bridge confirmó que recibió los fondos del source. | Actualiza `bridge_transfers.status`. Sin cambio en balance aún. |
| 3 | `payment_submitted` | Bridge ha enviado el pago al banco/wallet destino. | Actualiza `bridge_transfers.status`. Notificación opcional "Tu pago está en camino". |
| 4 | `payment_processed` | **✅ FINAL** — El banco destino confirmó la recepción. | Ledger `pending` → `settled`. Trigger DB resta `reserved_amount`. Payout → `completed`. Genera certificado. |

> **REGLA CRÍTICA:** Un transfer **siempre** progresa linealmente: `awaiting_funds` → `funds_received` → `payment_submitted` → `payment_processed`. **Nunca** puede retroceder.

---

### Estados de Revisión

| Estado Bridge | Descripción | Acción en Guira |
|:---|:---|:---|
| `in_review` | Bridge sometió la transacción a revisión AML/compliance interna. | Guira marca el payout como "en revisión por Bridge" (diferente a la revisión interna de Guira). No aplica acción contable. |
| `kyc_required` | Bridge requiere que el customer complete verificación adicional. | Guira notifica al usuario que debe completar verificación adicional en Bridge. |

---

### Estados de Excepción / Error

| Estado Bridge | Descripción | Acción en Guira |
|:---|:---|:---|
| `canceled` | Transfer fue cancelado antes de ser fondeado (desde `awaiting_funds`). | Ejecuta `.rpc('release_reserved_balance')`. Devuelve monto a `available_amount`. Ledger → `cancelled`. |
| `error` | Error técnico irrecuperable en el procesamiento. | Marca ledger como `failed`. Inicia proceso manual de revisión y posible liberación de saldo. |
| `returned` | El banco destino rechazó/devolvió el pago (ej. cuenta cerrada, datos incorrectos). | Marca ledger como `failed`. Ejecuta liberación de `reserved_amount`. Notifica al usuario. |
| `undeliverable` | No fue posible entregar los fondos al destino. | Similar a `returned`. Se intenta devolución automática al source. |
| `refund_in_flight` | Bridge está procesando la devolución de fondos al source. | Guira espera confirmación. Sin acción contable inmediata. |
| `refunded` | Los fondos fueron devueltos exitosamente al source. | Ejecuta liberación completa de `reserved_amount`. Ledger → `refunded`. Notificación al usuario. |
| `refund_failed` | La devolución falló. Los fondos están en limbo. | Escala a revisión manual del equipo de operaciones. Caso raro que requiere intervención. |

---

## 🔗 Mapeo de Estados: Bridge → Guira

| Estado Bridge | Estado `payout_requests` | Estado `ledger_entries` | Estado `bridge_transfers` |
|:---|:---|:---|:---|
| `awaiting_funds` | `processing` | `pending` | `awaiting_funds` |
| `funds_received` | `processing` | `pending` | `funds_received` |
| `payment_submitted` | `processing` | `pending` | `payment_submitted` |
| `payment_processed` | `completed` ✅ | `settled` ✅ | `payment_processed` |
| `in_review` | `processing` | `pending` | `in_review` |
| `canceled` | `cancelled` | `cancelled` | `canceled` |
| `error` | `failed` | `failed` | `error` |
| `returned` | `failed` | `failed` | `returned` |
| `refunded` | `refunded` | `refunded` | `refunded` |
| `refund_in_flight` | `processing` | `pending` | `refund_in_flight` |
| `refund_failed` | `failed` | `failed` | `refund_failed` |

---

## 💰 Impacto en Balance por Estado

| Estado Final | `available_amount` | `reserved_amount` | Neto |
|:---|:---:|:---:|:---|
| `payment_processed` | Sin cambio (ya se restó en paso 2) | Se pone a `$0` | Dinero salió definitivamente ✅ |
| `canceled` | Se **suma** de vuelta lo reservado | Se pone a `$0` | Dinero regresó al usuario ↩️ |
| `returned` / `refunded` | Se **suma** de vuelta lo reservado | Se pone a `$0` | Dinero regresó al usuario ↩️ |
| `error` / `refund_failed` | **Pendiente** revisión manual | Permanece congelado | Requiere intervención ⚠️ |

---

## ⏱️ Tiempos Típicos por Rail

| Payment Rail | `awaiting_funds` → `payment_processed` | Notas |
|:---|:---|:---|
| ACH | 1-3 días hábiles | Sujeto a horarios bancarios EE.UU. |
| Wire | 4-24 horas (mismo día si antes del cutoff) | Corte típico: 2:00 PM ET |
| SEPA | 1-2 días hábiles | Solo entre países de la zona euro |
| SPEI | Minutos a 1 hora | Horario bancario de México (6am-10pm CT) |
| Crypto (ETH/Polygon) | Segundos a minutos | Depende de la congestión de red |
