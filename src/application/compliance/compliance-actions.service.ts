import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { BridgeService } from '../bridge/bridge.service';
import { BridgeCustomerService } from '../onboarding/bridge-customer.service';
import { SetLimitsDto } from './dto/admin-compliance.dto';

@Injectable()
export class ComplianceActionsService {
  private readonly logger = new Logger(ComplianceActionsService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly bridgeService: BridgeService,
    private readonly bridgeCustomerService: BridgeCustomerService,
  ) {}

  // ── REVIEWS (Lectura) ─────────────────────────────────────────────

  async listOpenReviews(filters: Record<string, string>) {
    let query = this.supabase
      .from('compliance_reviews')
      .select('*')
      .eq('status', 'open')
      .order('priority', { ascending: false })
      .order('opened_at', { ascending: true });

    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) return [];

    const enrichedData = await Promise.all(
      data.map(async (review) => {
        let userId: string | null = null;

        try {
          if (review.subject_type === 'kyc_applications') {
            const { data: kyc } = await this.supabase.from('kyc_applications').select('user_id').eq('id', review.subject_id).single();
            userId = kyc?.user_id || null;
          } else if (review.subject_type === 'kyb_applications') {
            const { data: kyb } = await this.supabase.from('kyb_applications').select('requester_user_id').eq('id', review.subject_id).single();
            userId = kyb?.requester_user_id || null;
          } else if (review.subject_type === 'payout_request') {
            const { data: pay } = await this.supabase.from('payout_requests').select('user_id').eq('id', review.subject_id).single();
            userId = pay?.user_id || null;
          }
        } catch (err) {
          // Ignore relations error if subject was deleted
        }

        let profileData: Record<string, any> | null = null;
        if (userId) {
          const { data: prof } = await this.supabase.from('profiles').select('email, full_name, role').eq('id', userId).maybeSingle();
          if (prof) {
            let businessName = null;
            if (review.subject_type === 'kyb_applications') {
              const { data: biz } = await this.supabase.from('businesses').select('legal_name').eq('user_id', userId).maybeSingle();
              businessName = biz?.legal_name;
            }

            let firstName = '';
            let lastName = '';
            if (prof.full_name) {
              const parts = prof.full_name.split(' ');
              firstName = parts[0] || '';
              lastName = parts.slice(1).join(' ') || '';
            }

            profileData = {
              email: prof.email,
              first_name: firstName,
              last_name: lastName,
              full_name: prof.full_name,
              business_name: businessName || '',
            };
          }
        }

        return {
          ...review,
          profiles: profileData,
        };
      }),
    );

    return enrichedData;
  }

  async getReviewDetail(reviewId: string) {
    const { data: review, error } = await this.supabase
      .from('compliance_reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (error || !review) throw new NotFoundException('Review no encontrado');

    const { data: events } = await this.supabase
      .from('compliance_review_events')
      .select('*')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: false });

    const { data: comments } = await this.supabase
      .from('compliance_review_comments')
      .select('*')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true });

    return { ...review, events, comments };
  }

  // ── REVIEWS (Acciones) ────────────────────────────────────────────

  async assignReview(reviewId: string, staffUserId: string, actorId: string) {
    await this.supabase
      .from('compliance_reviews')
      .update({ assigned_to: staffUserId })
      .eq('id', reviewId);

    // Audit log
    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      role: 'staff',
      action: 'ASSIGN_COMPLIANCE_REVIEW',
      table_name: 'compliance_reviews',
      record_id: reviewId,
      new_values: { assigned_to: staffUserId },
      source: 'admin_panel',
    });

    return { message: 'Review asignado' };
  }

  async escalateReview(reviewId: string, actorId: string) {
    await this.supabase
      .from('compliance_reviews')
      .update({ priority: 'urgent' })
      .eq('id', reviewId);

    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      role: 'staff',
      action: 'ESCALATE_COMPLIANCE_REVIEW',
      table_name: 'compliance_reviews',
      record_id: reviewId,
      new_values: { priority: 'urgent' },
      source: 'admin_panel',
    });

    return { message: 'Review escalado a urgente' };
  }

  // ── COMMENTS ──────────────────────────────────────────────────────

  async addComment(reviewId: string, authorId: string, body: string, isInternal = true) {
    const { data, error } = await this.supabase
      .from('compliance_review_comments')
      .insert({
        review_id: reviewId,
        author_id: authorId,
        body,
        is_internal: isInternal,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ── DECISIONS (Inmutables) ────────────────────────────────────────

  async approveReview(reviewId: string, actorId: string, reason: string) {
    const { data: review } = await this.supabase
      .from('compliance_reviews')
      .select('subject_type, subject_id, status')
      .eq('id', reviewId)
      .single();

    if (!review) throw new NotFoundException('Review no encontrado');
    if (review.status === 'closed') throw new BadRequestException('El review ya está cerrado');

    // 1. Inmutable Event
    await this.supabase.from('compliance_review_events').insert({
      review_id: reviewId,
      actor_id: actorId,
      decision: 'APPROVED',
      reason,
    });

    // 2. Cerrar Review
    await this.supabase
      .from('compliance_reviews')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', reviewId);

    // 3. Aplicar aprobación
    await this.applyApprovalToSubject(review.subject_type, review.subject_id, actorId, reason);

    // 4. Audit Log
    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      role: 'staff',
      action: 'APPROVE_COMPLIANCE_REVIEW',
      table_name: 'compliance_reviews',
      record_id: reviewId,
      reason,
      source: 'admin_panel',
    });

    return { message: 'Review aprobado y procesado' };
  }

  async rejectReview(reviewId: string, actorId: string, reason: string) {
    const { data: review } = await this.supabase
      .from('compliance_reviews')
      .select('subject_type, subject_id, status')
      .eq('id', reviewId)
      .single();

    if (!review) throw new NotFoundException('Review no encontrado');
    if (review.status === 'closed') throw new BadRequestException('El review ya está cerrado');

    // 1. Inmutable Event
    await this.supabase.from('compliance_review_events').insert({
      review_id: reviewId,
      actor_id: actorId,
      decision: 'REJECTED',
      reason,
    });

    // 2. Cerrar Review
    await this.supabase
      .from('compliance_reviews')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', reviewId);

    // 3. Aplicar rechazo
    await this.applyRejectionToSubject(review.subject_type, review.subject_id, actorId, reason);

    // 4. Audit Log
    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      role: 'staff',
      action: 'REJECT_COMPLIANCE_REVIEW',
      table_name: 'compliance_reviews',
      record_id: reviewId,
      reason,
      source: 'admin_panel',
    });

    return { message: 'Review rechazado' };
  }

  async requestChanges(reviewId: string, actorId: string, reason: string, requiredActions?: string[]) {
    const { data: review } = await this.supabase
      .from('compliance_reviews')
      .select('subject_type, subject_id, status')
      .eq('id', reviewId)
      .single();

    if (!review) throw new NotFoundException('Review no encontrado');
    if (review.status === 'closed') throw new BadRequestException('El review ya está cerrado');

    // 1. Evento inmutable de la decisión (NEEDS_CHANGES)
    await this.supabase.from('compliance_review_events').insert({
      review_id: reviewId,
      actor_id: actorId,
      decision: 'NEEDS_CHANGES',
      reason,
      metadata: requiredActions ? { required_actions: requiredActions } : null,
    });

    // 2. El review queda ABIERTO (no cerrado) — el cliente debe corregir
    await this.supabase
      .from('compliance_reviews')
      .update({ priority: 'normal' })
      .eq('id', reviewId);

    // 3. Actualizar estado del subject a 'needs_review'
    if (review.subject_type === 'kyc_applications') {
      await this.supabase
        .from('kyc_applications')
        .update({ status: 'needs_review' })
        .eq('id', review.subject_id);
    } else if (review.subject_type === 'kyb_applications') {
      await this.supabase
        .from('kyb_applications')
        .update({ status: 'needs_review' })
        .eq('id', review.subject_id);
    }

    // 4. Notificar al cliente
    let userIdNotified: string | null = null;
    if (review.subject_type === 'kyc_applications') {
      const { data } = await this.supabase.from('kyc_applications').select('user_id').eq('id', review.subject_id).single();
      userIdNotified = data?.user_id;
    } else if (review.subject_type === 'kyb_applications') {
      const { data } = await this.supabase.from('kyb_applications').select('requester_user_id').eq('id', review.subject_id).single();
      userIdNotified = data?.requester_user_id;
    }

    if (userIdNotified) {
      const actionsMsg = requiredActions?.length
        ? `\n\nAcciones requeridas: ${requiredActions.join(', ')}`
        : '';
      await this.supabase.from('notifications').insert({
        user_id: userIdNotified,
        type: 'alert',
        title: 'Se requieren correcciones',
        message: `Su expediente necesita correcciones. ${reason}${actionsMsg}`,
      });
    }

    // 5. Audit log
    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      role: 'staff',
      action: 'REQUEST_CHANGES_COMPLIANCE_REVIEW',
      table_name: 'compliance_reviews',
      record_id: reviewId,
      reason,
      new_values: { required_actions: requiredActions },
      source: 'admin_panel',
    });

    return { message: 'Se solicitó al cliente que corrija su expediente' };
  }

  // ── HELPERS: Subjects ─────────────────────────────────────────────

  private async applyApprovalToSubject(
    subjectType: string,
    subjectId: string,
    actorId: string,
    reason: string,
  ): Promise<void> {
    switch (subjectType) {
      case 'kyc_applications': {
        const { data: kyc } = await this.supabase
          .from('kyc_applications')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('id', subjectId)
          .select('user_id')
          .single();

        if (kyc?.user_id) {
          await this.supabase
            .from('profiles')
            .update({ onboarding_status: 'approved' })
            .eq('id', kyc.user_id);

          // Registra en Bridge (crea bridge_customer + bridge_kyc_link)
          // BridgeCustomerService manejará la llamada y DB.
          try {
            await this.bridgeCustomerService.registerCustomerInBridge(kyc.user_id);
          } catch (err) {
            this.logger.error(`Error registrando cliente en Bridge: ${err}`);
            // No revertimos approval local, el staff lo gestionará por logs
          }
        }
        break;
      }
      case 'kyb_applications': {
        const { data: kyb } = await this.supabase
          .from('kyb_applications')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('id', subjectId)
          .select('requester_user_id')
          .single();

        if (kyb?.requester_user_id) {
          await this.supabase
            .from('profiles')
            .update({ onboarding_status: 'approved' })
            .eq('id', kyb.requester_user_id);

          try {
            await this.bridgeCustomerService.registerCustomerInBridge(kyb.requester_user_id);
          } catch (err) {
            this.logger.error(`Error registrando negocio en Bridge: ${err}`);
          }
        }
        break;
      }
      case 'payout_request': {
        // Ejecutar payout en Bridge (que libera saldos, crea transfers, etc)
        await this.bridgeService.approvePayout(subjectId, actorId);
        break;
      }
    }
  }

  private async applyRejectionToSubject(
    subjectType: string,
    subjectId: string,
    actorId: string,
    reason: string,
  ): Promise<void> {
    switch (subjectType) {
      case 'kyc_applications':
        await this.supabase
          .from('kyc_applications')
          .update({ status: 'rejected' })
          .eq('id', subjectId);
        break;
      
      case 'kyb_applications':
        await this.supabase
          .from('kyb_applications')
          .update({ status: 'rejected' })
          .eq('id', subjectId);
        break;

      case 'payout_request':
        // Rechazar payout en Bridge Service (libera saldos)
        await this.bridgeService.rejectPayout(subjectId, reason, actorId);
        break;
    }

    // Identificar el user_id para notificar
    let userIdNotified: string | null = null;
    if (subjectType === 'kyc_applications') {
      const { data } = await this.supabase.from('kyc_applications').select('user_id').eq('id', subjectId).single();
      userIdNotified = data?.user_id;
    } else if (subjectType === 'kyb_applications') {
      const { data } = await this.supabase.from('kyb_applications').select('requester_user_id').eq('id', subjectId).single();
      userIdNotified = data?.requester_user_id;
    } else if (subjectType === 'payout_request') {
      const { data } = await this.supabase.from('payout_requests').select('user_id').eq('id', subjectId).single();
      userIdNotified = data?.user_id;
    }

    if (userIdNotified) {
      await this.supabase.from('notifications').insert({
        user_id: userIdNotified,
        type: 'alert',
        title: 'Revisión Rechazada',
        message: `Su solicitud ha sido rechazada. Razón: ${reason}`,
      });
    }
  }

  // ── USER LIMITS ───────────────────────────────────────────────────

  async setTransactionLimits(userId: string, actorId: string, dto: SetLimitsDto) {
    const { data: current } = await this.supabase
      .from('transaction_limits')
      .select('*')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newLimits = {
      user_id: userId,
      daily_deposit_limit: dto.daily_deposit_limit ?? current?.daily_deposit_limit,
      daily_payout_limit: dto.daily_payout_limit ?? current?.daily_payout_limit,
      single_txn_limit: dto.single_txn_limit ?? current?.single_txn_limit,
      applied_by: actorId,
      reason: dto.reason,
    };

    const { data, error } = await this.supabase
      .from('transaction_limits')
      .insert(newLimits)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      role: 'admin',
      action: 'SET_TRANSACTION_LIMITS',
      table_name: 'transaction_limits',
      record_id: userId,
      reason: dto.reason,
      new_values: newLimits,
      source: 'admin_panel',
    });

    return data;
  }
}
