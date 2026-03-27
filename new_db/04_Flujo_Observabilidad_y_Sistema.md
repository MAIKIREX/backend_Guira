# Flujo 04: Observabilidad, Webhooks y Sistema

Este documento describe cómo la plataforma mantiene su confiabilidad, trazabilidad y comunicación con el usuario a través de sus módulos de infraestructura.

---

## 🪝 SISTEMA DE WEBHOOKS (Fiabilidad Asíncrona)

### El Problema que Resuelve

Si Bridge envía un webhook notificando que un Wire de $50,000 llegó, y nuestro servidor está caído en ese instante, **el dinero desaparece** del sistema. Para evitar esto, usamos el patrón **"Webhook Sink" o "Inbox Pattern"**.

### Flujo Completo

```
[Bridge/Proveedor] → POST https://app.guira.com/webhooks/bridge
    │
    └── [Endpoint minimalista] → INSERT INTO webhook_events (
                provider = 'bridge',
                event_type = 'virtual_account.funds_received',
                provider_event_id = 'evt_bridge_xyz',
                raw_payload = { ... JSON crudo ... },
                status = 'pending',
                received_at = NOW()
            )
    ← Responde HTTP 200 inmediatamente ← Bridge no reintenta si recibe 200

[CRON Worker — cada 30 segundos] → 
    SELECT * FROM webhook_events WHERE status = 'pending' ORDER BY received_at
    │
    ├── Para cada evento:
    │       ├── Parsea el raw_payload
    │       ├── Determina qué tablas afectar (basado en event_type)
    │       ├── Ejecuta la lógica de negocio (crear ledger_entry, actualizar transfer, etc.)
    │       ├── UPDATE balances via trigger (si hay nueva ledger_entry)
    │       ├── UPDATE webhook_events SET status = 'processed', processed_at = NOW()
    │       └── Si falla: UPDATE webhook_events SET 
    │               status = 'failed',
    │               retry_count = retry_count + 1,
    │               last_error = 'Connection timeout'
    │
    └── [Alerta] → Si webhook_events.retry_count > 4:
            INSERT INTO notifications (
                user_id = admin_user_id,
                type = 'system',
                title = 'Webhook sin procesar — acción requerida'
            )
```

### Tipos de Webhook que se Capturan

| `event_type` | Acción del Worker |
|---|---|
| `virtual_account.funds_received` | Crea `payment_order` + `ledger_entry` + update `balances` |
| `transfer.complete` | Actualiza `bridge_transfers.status` + genera `certificate` + update `balances` |
| `transfer.failed` | Genera `ledger_entry` reversal + libera `balances.reserved_amount` + notifica cliente |
| `kyc_link.approved` | Actualiza `kyc_applications.status = 'APPROVED'` + `profiles.bridge_customer_id` |
| `kyb_link.approved` | Actualiza `kyb_applications.status = 'APPROVED'` + `profiles.onboarding_status = 'verified'` |

---

## 📋 AUDIT LOGS (Trazabilidad Inmutable)

Toda acción de Staff o Admin sobre tablas sensibles dispara automáticamente un `audit_log`:

```
[Admin] → UPDATE wallets SET is_active = false WHERE id = X

[Trigger PostgreSQL / Middleware Backend] → INSERT INTO audit_logs (
    performed_by = admin.user_id,
    role = 'admin',
    action = 'DEACTIVATE_WALLET',
    table_name = 'wallets',
    record_id = wallets.id,
    affected_fields = ARRAY['is_active'],
    previous_values = { "is_active": true },
    new_values      = { "is_active": false },
    reason = "Cumplimiento OFAC: investigación en curso",
    source = 'admin_panel',
    created_at = NOW()
)
```

Otro ejemplo con balances:
```
[Admin] → Ajuste manual de balance (ledger_entry tipo 'adjustment')
    └── Trigger: INSERT INTO audit_logs (
            action = 'MANUAL_BALANCE_ADJUSTMENT',
            table_name = 'ledger_entries',
            new_values = { "amount": -500, "currency": "USD", "reason": "Corrección por fee duplicado" },
            reason = "Fee cobrado dos veces en transfer trans_abc. Verificado con Bridge."
        )
```

**Reglas de Inmutabilidad (RLS):**
- Solo el rol `service_role` (backend) puede `INSERT` en `audit_logs`.
- **Ningún rol** puede `UPDATE` o `DELETE` filas de `audit_logs`.
- Staff y Admin pueden `SELECT` para revisar el historial.

---

## 🔄 BRIDGE PULL JOBS (Sincronización Forzada)

Cuando sospechan que se perdió información o hay discrepancias entre `balances` locales y el estado real en Bridge:

```
[Admin] → Desde panel, lanza un "Pull Job" para sincronizar últimas 24h

[Sistema] → INSERT INTO bridge_pull_jobs (
    initiated_by = admin.user_id,
    job_type = 'TRANSFER_SYNC',
    date_range_from = NOW() - INTERVAL '24h',
    date_range_to = NOW(),
    status = 'running'
)

[Worker] → GET https://api.bridge.xyz/v0/transfers?from=...&to=...
    │
    ├── Compara cada transfer de Bridge con bridge_transfers locales
    ├── Detecta "gaps" (transferencias en Bridge que no están en DB o sin ledger_entry)
    ├── Para cada gap encontrado:
    │       ├── INSERT ledger_entries (recovery entry)
    │       ├── UPDATE balances via trigger
    │       └── Registra la acción en gaps_detail
    │
    └── UPDATE bridge_pull_jobs SET
            status = 'completed',
            records_checked = 147,
            gaps_found = 2,
            gaps_detail = [{ "bridge_id": "trans_missing", "amount": 500 }],
            actions_taken = [{ "action": "created_ledger_entry", "reference": "led_recovery_001" }],
            completed_at = NOW()
```

---

## 🔔 SISTEMA DE NOTIFICACIONES

```
[Cualquier evento importante] → INSERT INTO notifications (
    user_id,
    type = 'financial' | 'onboarding' | 'compliance' | 'system' | 'support',
    title = 'Depósito Confirmado',
    message = 'Recibiste $4,999.50 USDC. Tu saldo disponible es $14,999.50 USDC.',
    link = '/dashboard/transactions',     ← deeplink dentro de la app
    reference_type = 'payment_order',    ← para que el frontend identifique el objeto
    reference_id = payment_order.id,
    is_read = false
)

[Frontend] → Supabase Realtime escucha INSERT en notifications WHERE user_id = auth.uid()
[Cliente lee] → UPDATE notifications SET is_read = true, read_at = NOW()
```

**Eventos que generan notificaciones automáticas:**

| Evento | Tipo | Mensaje |
|---|---|---|
| Depósito acreditado | `financial` | "Recibiste $X en tu cuenta" |
| Retiro completado | `financial` | "Tu retiro de $X fue enviado a ****4321" |
| Retiro fallido | `financial` | "Tu retiro de $X falló. Fondos devueltos." |
| KYC necesita correcciones | `compliance` | "Tu expediente necesita cambios" |
| KYC/KYB aprobado | `onboarding` | "¡Tu cuenta fue verificada! Ya puedes operar." |
| Ticket de soporte actualizado | `support` | "El Staff respondió tu ticket #TKT-001" |

---

## ⚙️ APP SETTINGS (Feature Flags y Configuración)

La tabla `app_settings` permite al Admin ajustar comportamientos sin redeploys:

| `key` | `value` | Efecto |
|---|---|---|
| `MIN_PAYOUT_USD` | `50.00` | Monto mínimo de retiro en USD |
| `MAX_PAYOUT_USD` | `100000.00` | Monto máximo de retiro en USD |
| `PAYOUT_REVIEW_THRESHOLD` | `5000.00` | Retiros mayores requieren revisión de Compliance |
| `MAINTENANCE_MODE` | `false` | Bloquea nuevas transacciones en la plataforma |
| `BRIDGE_ENVIRONMENT` | `production` | Controla si se usa sandbox o producción de Bridge |
| `KYB_AUTO_APPROVE_TEST` | `false` | Auto-aprueba KYBs (solo entornos de prueba) |
| `DEFAULT_DEVELOPER_FEE_PERCENT` | `1.0` | Fee por defecto aplicado en Virtual Accounts |
| `SUPPORTED_CURRENCIES` | `["USD","USDC","EUR"]` | Divisas activas en la plataforma |
