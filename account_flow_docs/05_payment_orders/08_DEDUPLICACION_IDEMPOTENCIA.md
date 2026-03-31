# 08 — Deduplicación e Idempotencia de Payment Orders

> Este documento explica los mecanismos de seguridad que previenen la **doble acreditación** de fondos, el escenario financiero más peligroso en una plataforma de pagos.

---

## 🧠 ¿Qué es la Doble Acreditación?

Es cuando el mismo depósito se registra **dos veces** en el sistema, resultando en un balance inflado ficticio:

```
❌ PELIGRO: Doble Acreditación
─────────────────────────────
Wire de $1,000 recibido UNA vez
    → payment_order #1: +$990
    → payment_order #2: +$990  ← DUPLICADA
    → balance del usuario: $1,980  ← $990 ficticios
```

---

## 🛡️ Mecanismos de Protección (3 Capas)

### Capa 1: `webhook_events.provider_event_id` (UNIQUE)

La **primera línea de defensa** actúa en el Webhook Sink. Si Bridge envía el mismo webhook dos veces (reintento), el INSERT en `webhook_events` falla por constraint UNIQUE en `provider_event_id`:

```sql
-- Tabla: webhook_events
provider_event_id TEXT UNIQUE  -- ej: 'evt_bridge_789'
```

```typescript
// webhooks.service.ts — sinkEvent()
const { error } = await supabase.from('webhook_events').insert({
    provider: 'bridge',
    provider_event_id: 'evt_bridge_789',  // ← UNIQUE
    ...
});

if (error?.code === '23505') {
    // Constraint violation → evento duplicado
    logger.warn('Evento duplicado ignorado: evt_bridge_789');
    return; // ← No se procesa
}
```

**Resultado:** El mismo webhook de Bridge **nunca** se persiste dos veces.

---

### Capa 2: `payment_orders.bridge_event_id` (UNIQUE)

La **segunda línea de defensa** actúa al crear la payment_order. Si por alguna razón el webhook se persistió pero se intenta crear la payment_order dos veces, el constraint UNIQUE en `bridge_event_id` lo impide:

```sql
-- Tabla: payment_orders
bridge_event_id TEXT UNIQUE NULLABLE  -- ej: 'evt_bridge_789'
```

```typescript
// webhooks.service.ts — handleInternalDeposit()
const { data: order, error } = await supabase
    .from('payment_orders')
    .insert({
        bridge_event_id: 'evt_bridge_789',  // ← UNIQUE
        ...
    })
    .select('id')
    .single();

// Si error.code === '23505' → ya existe una order con ese evento
```

**Resultado:** Nunca habrá dos `payment_orders` para el mismo evento de Bridge.

---

### Capa 3: Procesamiento CRON — Status Check

La **tercera línea de defensa** es el propio flujo del CRON. Solo procesa webhooks con `status = 'pending'`:

```typescript
// SOLO toma eventos no procesados:
const { data: events } = await supabase
    .from('webhook_events')
    .select('*')
    .eq('status', 'pending')       // ← Solo pending
    .lt('retry_count', 5)          // ← Y con < 5 reintentos
    .order('received_at', { ascending: true })
    .limit(50);
```

Una vez procesado exitosamente → `status = 'processed'`. No se toca de nuevo.

---

## 📊 Diagrama de las 3 Capas

```
Bridge envía webhook (puede enviar 2 veces por reintento)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  CAPA 1: webhook_events.provider_event_id UNIQUE    │
│  ┌─ INSERT #1: ✅ Éxito                             │
│  └─ INSERT #2: ❌ 23505 duplicate → ignorado        │
└─────────────────────────────────────────────────────┘
    │
    ▼ (solo si pasó Capa 1)
┌─────────────────────────────────────────────────────┐
│  CAPA 2: payment_orders.bridge_event_id UNIQUE      │
│  ┌─ INSERT #1: ✅ Éxito                             │
│  └─ INSERT #2: ❌ 23505 duplicate → error capturado │
└─────────────────────────────────────────────────────┘
    │
    ▼ (solo si pasó Capa 2)
┌─────────────────────────────────────────────────────┐
│  CAPA 3: webhook_events.status = 'pending' filter   │
│  ┌─ Primera vez: ✅ Procesado → status = 'processed'│
│  └─ Segunda vez: webhook ya no es 'pending' → skip  │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Escenarios de Fallo y Recovery

### Escenario 1: Handler falla a mitad de camino

```
1. Webhook recibido ✅
2. bridge_virtual_account_events insertado ✅
3. payment_orders insertado ✅
4. ledger_entries INSERT → ❌ ERROR (ej. conexión DB)
5. Handler lanza excepción
```

**¿Qué pasa?**
- `webhook_events.status` se queda en `pending` (no se marcó como `processed`)
- `webhook_events.retry_count` se incrementa en +1
- En el siguiente ciclo CRON (30s), **se reintenta todo el handler**

**¿Hay doble acreditación?**
- ❌ No. El re-intento intentará INSERT en `payment_orders` con el mismo `bridge_event_id`, lo cual falla por UNIQUE constraint.
- ⚠️ **PERO:** El `bridge_virtual_account_events` se duplicaría. Esto es aceptable porque esa tabla no afecta balances.
- 🔮 **Mejora futura:** Envolver los steps 3-4 en una función PostgreSQL transaccional (RPC) para atomicidad total.

### Escenario 2: Servidor se cae durante procesamiento

```
1. Webhook recibido ✅ → INSERT webhook_events ✅
2. HTTP 200 devuelto a Bridge ✅
3. 🔥 Servidor se reinicia
4. CRON arranca → lee evento pending → procesa normalmente
```

**¿Hay doble acreditación?** ❌ No. El evento está en `webhook_events` esperando. Cuando el servidor vuelve, se procesa normalmente.

### Escenario 3: Bridge envía webhook 3 veces (redundancia)

```
POST #1: INSERT webhook_events ✅
POST #2: Duplicate provider_event_id → ❌ ignorado
POST #3: Duplicate provider_event_id → ❌ ignorado

CRON: Procesa solo #1
```

**¿Hay doble acreditación?** ❌ No.

---

## 📋 Checklist de Verificación de Idempotencia

| Verificación | Query | Resultado esperado |
|:---|:---|:---|
| No hay `bridge_event_id` duplicados en `payment_orders` | `SELECT bridge_event_id, COUNT(*) FROM payment_orders GROUP BY bridge_event_id HAVING COUNT(*) > 1` | **0 filas** |
| No hay `provider_event_id` duplicados en `webhook_events` | `SELECT provider_event_id, COUNT(*) FROM webhook_events GROUP BY provider_event_id HAVING COUNT(*) > 1` | **0 filas** |
| Cada payment_order completada tiene exactamente 1 ledger (o 2 si sweep) | Ver query en [doc 07](./07_RELACION_LEDGER_BALANCES.md) | Sin discrepancias |

---

## 🚨 Alertas de Monitoreo Recomendadas

| Alerta | Condición | Acción |
|:---|:---|:---|
| **Webhook saturación** | `webhook_events` con status `pending` > 100 | Verificar que el CRON está corriendo |
| **Reintentos excesivos** | `webhook_events.retry_count >= 3` | Revisar logs del handler para errores específicos |
| **Fallos permanentes** | `webhook_events.status = 'failed'` | ⚠️ Admin debe investigar y posiblemente re-procesar manualmente |
| **Doble bridge_event_id** | Query de verificación arriba | 🚨 CRÍTICO: investigar inmediatamente |

---

## 📁 Archivos Fuente

- **Webhook Sink:** [`webhooks.service.ts`](../../src/application/webhooks/webhooks.service.ts) — método `sinkEvent()` (líneas 32-51)
- **CRON Worker:** [`webhooks.service.ts`](../../src/application/webhooks/webhooks.service.ts) — método `processWebhooks()` (líneas 57-78)
- **Deduplicación DB:** Constraint `UNIQUE` en `payment_orders.bridge_event_id`
