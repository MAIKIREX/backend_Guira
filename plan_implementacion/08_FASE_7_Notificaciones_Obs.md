# FASE 7 — Notificaciones, Observabilidad y Módulos de Soporte
> **Duración estimada:** 2-3 días  
> **Dependencias:** Todas las fases anteriores  
> **Módulos NestJS:** `notifications/` (nuevo) + `admin/` (nuevo) + `support/` (nuevo)

---

## Objetivo

Implementar los módulos transversales que dan visibilidad al sistema:
- **Notificaciones** — Feed de alertas en tiempo real para el cliente
- **Audit Logs** — Trazabilidad completa para el Admin
- **App Settings** — Feature flags y configuración dinámica
- **Reconciliation** — Verificación de integridad financiera
- **Support Tickets** — Helpdesk integrado

---

## 📋 CHECKLIST DE ESTA FASE

### Notificaciones
- [ ] F7.1 — `GET /notifications` — lista notificaciones del usuario autenticado (paginado)
- [ ] F7.2 — `GET /notifications/unread-count` — contador de no leídas
- [ ] F7.3 — `PATCH /notifications/:id/read` — marcar notificación como leída
- [ ] F7.4 — `PATCH /notifications/read-all` — marcar todas como leídas
- [ ] F7.5 — Servicio interno: `sendNotification(userId, type, title, message, referenceType?, referenceId?)` — helper centralizador
- [ ] F7.6 — Supabase Realtime: documentar cómo el frontend suscribe a `notifications` WHERE `user_id = auth.uid()`

### Admin: App Settings
- [ ] F7.7 — `GET /admin/settings` — lista todos los settings
- [ ] F7.8 — `GET /admin/settings/:key` — obtener valor de un setting
- [ ] F7.9 — `PATCH /admin/settings/:key` — actualizar valor de un setting (Super Admin)
- [ ] F7.10 — `GET /settings/public` — settings marcados como `is_public = true` (sin auth)

### Admin: Audit Logs
- [ ] F7.11 — `GET /admin/audit-logs` — historial de auditoría con filtros
  - Filtros: `performed_by`, `action`, `table_name`, `from_date`, `to_date`
- [ ] F7.12 — `GET /admin/audit-logs/user/:userId` — audit de un usuario específico
- [ ] F7.13 — Export: permitir download CSV de audit logs (para reguladores)

### Admin: Activity Logs (Vista pública por usuario)
- [ ] F7.14 — `GET /activity` — feed de actividad del cliente autenticado (últimas 50 acciones)
- [ ] F7.15 — `GET /admin/activity/:userId` — activity log de un usuario específico (Staff+)

### Reconciliation (Admin)
- [ ] F7.16 — `POST /admin/reconciliation/run` — iniciar una reconciliación manual
  - Compara `SUM(ledger_entries) = balances.amount` para todos los usuarios
  - Registra discrepancias en `reconciliation_runs`
- [ ] F7.17 — `GET /admin/reconciliation` — historial de reconciliaciones
- [ ] F7.18 — `GET /admin/reconciliation/:id` — resultado detallado (discrepancias)
- [ ] F7.19 — Servicio interno: `runReconciliation()` — algoritmo de verificación

### Support Tickets
- [ ] F7.20 — `POST /support/tickets` — crear ticket (cliente o anónimo)
- [ ] F7.21 — `GET /support/tickets` — lista tickets del usuario autenticado
- [ ] F7.22 — `GET /support/tickets/:id` — detalle del ticket
- [ ] F7.23 — `GET /admin/support/tickets` — todos los tickets (Staff+)
- [ ] F7.24 — `PATCH /admin/support/tickets/:id/assign` — asignar ticket a Staff
- [ ] F7.25 — `PATCH /admin/support/tickets/:id/status` — cambiar estado (open/in_progress/resolved/closed)
- [ ] F7.26 — `PATCH /admin/support/tickets/:id/resolve` — marcar como resuelto con notas

---

## 🏗️ ARQUITECTURA DE MÓDULOS

```
src/application/
├── notifications/                  ← NUEVO
│   ├── notifications.module.ts
│   ├── notifications.controller.ts
│   ├── notifications.service.ts    ← incluye sendNotification() helper
│   └── dto/
│       └── notification-response.dto.ts
│
├── admin/                          ← NUEVO (módulo unificador para ops de Admin)
│   ├── admin.module.ts
│   ├── admin.controller.ts         ← settings, audit logs, reconciliation
│   ├── admin.service.ts
│   └── reconciliation.service.ts
│
└── support/                        ← NUEVO
    ├── support.module.ts
    ├── support.controller.ts
    ├── support.service.ts
    └── dto/
        ├── create-ticket.dto.ts
        └── ticket-response.dto.ts
```

---

## 🔑 SERVICIO: NotificationsService

```typescript
@Injectable()
export class NotificationsService {

  // Helper centralizado que usan TODOS los módulos
  async sendNotification(params: {
    userId: string;
    type: 'financial' | 'onboarding' | 'compliance' | 'system' | 'support';
    title: string;
    message: string;
    link?: string;
    referenceType?: string;
    referenceId?: string;
  }): Promise<void> {
    await this.supabase.from('notifications').insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      is_read: false,
    });
    // El frontend usa Supabase Realtime para escuchar INSERT en esta tabla
  }

  async getNotifications(userId: string, page: number, limit: number) {
    const offset = (page - 1) * limit;
    const { data, count } = await this.supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return { data, total: count, page, limit };
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId); // RLS extra garantía
  }
}
```

---

## 🔄 RECONCILIATION SERVICE

```typescript
async runReconciliation(initiatedBy: string): Promise<string> {
  // 1. Crear registro de run
  const { data: run } = await this.supabase.from('reconciliation_runs').insert({
    initiated_by: initiatedBy,
    run_type: 'MANUAL_FULL',
    status: 'running',
    started_at: new Date().toISOString(),
  }).select('id').single();

  // 2. Obtener todos los usuarios con wallets
  const { data: users } = await this.supabase
    .from('wallets').select('user_id, id, currency').eq('is_active', true);

  const discrepancies = [];
  let usersChecked = 0;

  for (const wallet of users) {
    // 3. Calcular saldo real desde ledger
    const { data: calc } = await this.supabase.rpc('calculate_balance_from_ledger', {
      p_wallet_id: wallet.id
    });

    // 4. Obtener saldo registrado
    const { data: balance } = await this.supabase
      .from('balances')
      .select('amount')
      .eq('user_id', wallet.user_id)
      .eq('currency', wallet.currency)
      .single();

    const ledgerTotal = calc?.total ?? 0;
    const balanceTotal = balance?.amount ?? 0;

    if (Math.abs(ledgerTotal - balanceTotal) > 0.01) {
      discrepancies.push({
        user_id: wallet.user_id,
        wallet_id: wallet.id,
        currency: wallet.currency,
        ledger_total: ledgerTotal,
        balance_total: balanceTotal,
        difference: ledgerTotal - balanceTotal,
      });
    }
    usersChecked++;
  }

  // 5. Actualizar resultado
  await this.supabase.from('reconciliation_runs').update({
    status: 'completed',
    users_checked: usersChecked,
    discrepancies_found: discrepancies.length,
    discrepancies_detail: discrepancies,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
  }).eq('id', run.id);

  return run.id;
}
```

---

## 📱 SUPABASE REALTIME — Documentación para Frontend

```typescript
// Frontend suscripción a notificaciones en tiempo real:
const channel = supabase
  .channel('notifications-feed')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
  }, (payload) => {
    // Mostrar toast/badge de nueva notificación
    dispatch(addNotification(payload.new));
  })
  .subscribe();
```

---

## 🎫 SUPPORT TICKET FLOW

```
Cliente:
  POST /support/tickets { subject, message, contact_email, reference_type?, reference_id? }
  → INSERT support_tickets { status: 'open', priority: 'normal' }
  → INSERT notifications al equipo de soporte (Admin)

Staff:
  GET /admin/support/tickets?status=open
  PATCH /admin/support/tickets/:id/assign { staff_user_id }
  PATCH /admin/support/tickets/:id/status { status: 'in_progress' }

Resolution:
  PATCH /admin/support/tickets/:id/resolve { resolution_notes }
  → UPDATE support_tickets { status: 'resolved', resolved_at, resolution_notes }
  → INSERT notifications al cliente
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

1. Cliente recibe notificación en tiempo real cuando su depósito es acreditado
2. `GET /notifications/unread-count` retorna el número correcto de no leídas
3. La reconciliación detecta discrepancias si un balance está mal calculado
4. Los audit logs filtran correctamente por usuario, acción y fecha
5. Un cliente puede crear un ticket linked a una transacción específica
6. Los settings públicos son accesibles sin autenticación

---

## 🔗 SIGUIENTE FASE

Con todos los módulos funcionales → **[FASE 8: Testing, Seguridad y Deploy](./09_FASE_8_Testing_Security.md)**
