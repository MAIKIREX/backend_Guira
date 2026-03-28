# FASE 6 — Compliance Admin Panel
> **Duración estimada:** 3-4 días  
> **Dependencias:** Fase 2 (KYC/KYB genera reviews) + Fase 1 (Roles Admin/Staff)  
> **Módulo NestJS:** `compliance/` (refactor) + endpoints `/admin/compliance`

---

## Objetivo

Implementar el sistema de revisión de cumplimiento para el equipo interno (Staff y Admin). Todo expediente KYC/KYB enviado y todo pago que supere el umbral de revisión debe poder ser gestionado desde estos endpoints.

El sistema produce un **expediente legal inmutable** con historial de comentarios y decisiones, cumpliendo con requisitos de auditoría FinCEN/OFAC.

---

## 📋 CHECKLIST DE ESTA FASE

### Compliance Reviews (Lectura y gestión)
- [ ] F6.1 — `GET /admin/compliance/reviews` — lista todos los casos abiertos (Staff+)
  - Filtros: `status`, `priority`, `subject_type`, `assigned_to`, `from_date`, `to_date`
  - Paginación: `page`, `limit`
  - Sort: `opened_at DESC`, `priority DESC`
- [ ] F6.2 — `GET /admin/compliance/reviews/:id` — detalle de un caso con historial completo
  - Incluir: subject data (KYC o KYB o payout), comments, events
- [ ] F6.3 — `PATCH /admin/compliance/reviews/:id/assign` — asignar caso a un staff member
- [ ] F6.4 — `PATCH /admin/compliance/reviews/:id/priority` — cambiar prioridad

### Compliance Decisions (Inmutables)
- [ ] F6.5 — `POST /admin/compliance/reviews/:id/approve` — APROBAR expediente
  - INSERT `compliance_review_events { decision: 'APPROVED' }`
  - UPDATE `compliance_reviews.status = 'closed'`
  - UPDATE `kyc_applications.status = 'approved'` (o kyb)
  - UPDATE `profiles.onboarding_status = 'approved'`
  - Llamar `registerCustomerInBridge()` si KYC/KYB
  - O aprobar el payout_request si es pago
  - INSERT `audit_logs`
  - INSERT `notifications` al cliente
- [ ] F6.6 — `POST /admin/compliance/reviews/:id/reject` — RECHAZAR expediente
  - INSERT `compliance_review_events { decision: 'REJECTED' }`
  - UPDATE kyc/kyb_applications.status = 'rejected'
  - INSERT notifications al cliente (razón del rechazo)
- [ ] F6.7 — `POST /admin/compliance/reviews/:id/request-changes` — Pedir correcciones
  - INSERT `compliance_review_events { decision: 'NEEDS_CHANGES' }`
  - UPDATE kyc/kyb_applications.status = 'needs_review'
  - INSERT notifications al cliente
- [ ] F6.8 — `POST /admin/compliance/reviews/:id/escalate` — Escalar a nivel superior
  - UPDATE compliance_reviews.status = 'escalated', priority = 'urgent'

### Compliance Comments (Notas del analista)
- [ ] F6.9 — `POST /admin/compliance/reviews/:id/comments` — agregar nota interna
  - INSERT `compliance_review_comments { is_internal: true }`
- [ ] F6.10 — `GET /admin/compliance/reviews/:id/comments` — lista comentarios del caso
- [ ] F6.11 — Los comentarios internos NO son visibles para el cliente (is_internal filter via RLS)

### Visualización por sujeto (para frontend Admin)
- [ ] F6.12 — `GET /admin/compliance/kyc/:userId` — expediente KYC completo de un usuario
  - Persona (`people`), documentos, aplicación, reviews activas
- [ ] F6.13 — `GET /admin/compliance/kyb/:businessId` — expediente KYB completo
  - Empresa, directores, UBOs, documentos, aplicación, reviews
- [ ] F6.14 — `GET /admin/users/:userId/activity` — historial de actividad de un usuario
  - audit_logs + activity_logs + payment_orders + bridge_transfers

### Transaction Limits (Solo Admin)
- [ ] F6.15 — `GET /admin/users/:userId/limits` — límites actuales del usuario
- [ ] F6.16 — `POST /admin/users/:userId/limits` — establecer límites personalizados
  - daily_deposit_limit, daily_payout_limit, single_txn_limit, etc.
  - Registra en `transaction_limits` con `applied_by` y `reason`
- [ ] F6.17 — `GET /admin/users/:userId/limits/history` — historial de cambios de límites

---

## 🏗️ ARQUITECTURA DEL MÓDULO

```
src/application/compliance/
├── compliance.module.ts
├── compliance.controller.ts         ← todos los endpoints admin restringidos
├── compliance.service.ts            ← lógica de negocio
├── compliance-actions.service.ts    ← NUEVO: lógica de decisiones (approve/reject)
└── dto/
    ├── compliance-review-response.dto.ts
    ├── approve-review.dto.ts          ← { reason: string }
    ├── reject-review.dto.ts           ← { reason: string }
    ├── add-comment.dto.ts             ← { body: string, is_internal: boolean }
    ├── set-limits.dto.ts
    └── assign-review.dto.ts           ← { staff_user_id: string }
```

---

## 🔑 SERVICE: ComplianceActionsService

```typescript
@Injectable()
export class ComplianceActionsService {

  async approveReview(reviewId: string, actorId: string, reason: string): Promise<void> {
    // 1. Obtener la review
    const { data: review } = await this.supabase
      .from('compliance_reviews')
      .select('subject_type, subject_id')
      .eq('id', reviewId)
      .single();

    // 2. Insertar evento inmutable (NEVER FAILS — this is the source of truth)
    await this.supabase.from('compliance_review_events').insert({
      review_id: reviewId,
      actor_id: actorId,
      decision: 'APPROVED',
      reason,
    });

    // 3. Cerrar la review
    await this.supabase.from('compliance_reviews').update({
      status: 'closed', closed_at: new Date().toISOString()
    }).eq('id', reviewId);

    // 4. Actualizar el sujeto según tipo
    await this.applyApprovalToSubject(review.subject_type, review.subject_id, actorId);

    // 5. Audit log
    await this.supabase.from('audit_logs').insert({
      performed_by: actorId, role: 'staff',
      action: 'APPROVE_COMPLIANCE_REVIEW',
      table_name: 'compliance_reviews',
      record_id: reviewId,
      reason, source: 'admin_panel',
    });
  }

  private async applyApprovalToSubject(
    subjectType: string, subjectId: string, actorId: string
  ): Promise<void> {
    switch (subjectType) {
      case 'kyc_applications':
        const { data: kyc } = await this.supabase
          .from('kyc_applications')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('id', subjectId).select('user_id').single();

        await this.supabase.from('profiles')
          .update({ onboarding_status: 'approved' })
          .eq('id', kyc.user_id);

        // Registrar cliente en Bridge
        await this.onboardingService.registerCustomerInBridge(kyc.user_id);
        break;

      case 'kyb_applications':
        const { data: kyb } = await this.supabase
          .from('kyb_applications')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('id', subjectId).select('requester_user_id').single();

        await this.supabase.from('profiles')
          .update({ onboarding_status: 'approved' })
          .eq('id', kyb.requester_user_id);
        break;

      case 'payout_request':
        // Aprobar y ejecutar el payout
        await this.bridgeService.executePayout(subjectId, null);
        break;
    }
  }
}
```

---

## 🔒 CONTROL DE ACCESO

```
GET /admin/compliance/*     → staff, admin, super_admin
POST /admin/compliance/*/approve  → staff, admin
POST /admin/compliance/*/reject   → staff, admin
POST /admin/compliance/*/escalate → admin, super_admin
POST /admin/users/*/limits        → admin, super_admin
```

---

## 📊 QUERY: Dashboard de Compliance

```typescript
// Vista agregada para el dashboard del Staff
async getComplianceDashboard(): Promise<object> {
  const [openReviews, urgentReviews, pendingPayouts] = await Promise.all([
    this.supabase.from('compliance_reviews')
      .select('id', { count: 'exact' }).eq('status', 'open'),
    this.supabase.from('compliance_reviews')
      .select('id', { count: 'exact' })
      .eq('status', 'open').eq('priority', 'urgent'),
    this.supabase.from('payout_requests')
      .select('id, amount, currency, user_id', { count: 'exact' })
      .eq('status', 'pending').gt('amount', threshold),
  ]);

  return {
    open_reviews: openReviews.count,
    urgent_reviews: urgentReviews.count,
    pending_payout_approvals: pendingPayouts.count,
  };
}
```

---

## ✅ CRITERIOS DE ACEPTACIÓN

1. Staff puede ver todos los expedientes KYC/KYB pendientes con filtros
2. Aprobar un KYC → `profiles.onboarding_status` se actualiza + cliente registrado en Bridge
3. Rechazar con razón → cliente recibe notificación con la razón específica
4. Agregar comentario interno → no visible para el cliente (is_internal = true, filtrado por RLS)
5. `compliance_review_events` es inmutable — intentar UPDATE lanza excepción (trigger Fase 0)
6. Historial de audit_logs muestra quién aprobó qué y cuándo

---

## 🔗 SIGUIENTE FASE

Con Compliance Admin funcional → **[FASE 7: Notificaciones y Observabilidad](./08_FASE_7_Notificaciones_Obs.md)**
