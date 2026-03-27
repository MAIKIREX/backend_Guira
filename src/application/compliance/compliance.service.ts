import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { RegisterDocumentDto, GetDocumentUploadUrlDto } from './dto/document.dto';

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  // ── Documentos ────────────────────────────────────────────────────

  /** URL firmada para que el frontend suba directamente a Storage */
  async getDocumentUploadUrl(userId: string, dto: GetDocumentUploadUrlDto) {
    const path = `${userId}/${Date.now()}-${dto.file_name}`;
    const { data, error } = await this.supabase.storage
      .from(dto.bucket)
      .createSignedUploadUrl(path);

    if (error) throw new Error(error.message);
    return { upload_url: data.signedUrl, storage_path: `${dto.bucket}/${path}` };
  }

  /** Registra un documento en la BD tras haberlo subido a Storage */
  async registerDocument(userId: string, dto: RegisterDocumentDto) {
    const { data, error } = await this.supabase
      .from('documents')
      .insert({ user_id: userId, ...dto })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Lista documentos del usuario */
  async listDocuments(userId: string, subjectType?: string) {
    let query = this.supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (subjectType) query = query.eq('subject_type', subjectType);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ── KYC Application ───────────────────────────────────────────────

  /** Obtiene la KYC application activa del usuario */
  async getKycApplication(userId: string) {
    const { data, error } = await this.supabase
      .from('kyc_applications')
      .select(`*, people (*)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Crea una nueva KYC application (si no existe una pendiente) */
  async createKycApplication(userId: string) {
    // Verificar que no haya un KYC activo
    const existing = await this.getKycApplication(userId);
    if (existing && ['submitted', 'pending'].includes(existing.status)) {
      return existing;
    }

    const { data, error } = await this.supabase
      .from('kyc_applications')
      .insert({ user_id: userId, status: 'pending' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Marca un KYC como submitted (enviado para revisión) */
  async submitKycApplication(userId: string, kycId: string) {
    const { data, error } = await this.supabase
      .from('kyc_applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', kycId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('KYC no encontrado o no pertenece al usuario');
    return data;
  }

  // ── KYB Application ───────────────────────────────────────────────

  /** Obtiene la KYB application con datos de negocio */
  async getKybApplication(userId: string) {
    const { data, error } = await this.supabase
      .from('kyb_applications')
      .select(`*, businesses (*, business_directors(*), business_ubos(*))`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Crea una nueva KYB application */
  async createKybApplication(userId: string) {
    const existing = await this.getKybApplication(userId);
    if (existing && ['submitted', 'pending'].includes(existing.status)) {
      return existing;
    }

    const { data, error } = await this.supabase
      .from('kyb_applications')
      .insert({ user_id: userId, status: 'pending' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Marca un KYB como submitted */
  async submitKybApplication(userId: string, kybId: string) {
    const { data, error } = await this.supabase
      .from('kyb_applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', kybId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('KYB no encontrado o no pertenece al usuario');
    return data;
  }

  // ── Compliance Reviews (lectura) ──────────────────────────────────

  async getComplianceReviews(userId: string) {
    const { data, error } = await this.supabase
      .from('compliance_reviews')
      .select('*')
      .eq('subject_id', userId)
      .order('reviewed_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }
}
