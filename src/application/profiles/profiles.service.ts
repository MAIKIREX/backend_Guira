import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  // ───────────────────────────────────────────────
  //  Endpoints para el usuario autenticado
  // ───────────────────────────────────────────────

  /**
   * Retorna el perfil completo del usuario autenticado.
   */
  async findOne(userId: string): Promise<ProfileResponseDto> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Perfil no encontrado');
    return data as ProfileResponseDto;
  }

  /**
   * Actualiza el avatar visual del perfil del usuario (avatar_url).
   */
  async update(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({
        avatar_url: dto.avatar_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data as ProfileResponseDto;
  }

  /**
   * Genera una URL firmada para subir avatar a Supabase Storage.
   */
  async getAvatarUploadUrl(
    userId: string,
    fileName: string,
  ): Promise<{ upload_url: string; path: string }> {
    const path = `${userId}/${Date.now()}-${fileName}`;
    const { data, error } = await this.supabase.storage
      .from('avatars')
      .createSignedUploadUrl(path);

    if (error) throw new BadRequestException(error.message);
    return { upload_url: data.signedUrl, path };
  }

  /**
   * Retorna un resumen del estado de onboarding del usuario.
   */
  async getOnboardingStatus(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('onboarding_status, bridge_customer_id')
      .eq('id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Perfil no encontrado');

    return {
      onboarding_status: data.onboarding_status,
      has_bridge_account: !!data.bridge_customer_id,
    };
  }

  // ───────────────────────────────────────────────
  //  Endpoints de administración (Admin / Staff)
  // ───────────────────────────────────────────────

  /**
   * Lista todos los perfiles de forma paginada.
   * Solo accesible por admin/staff.
   */
  async findAll(
    page = 1,
    limit = 20,
    filters?: {
      role?: string;
      onboarding_status?: string;
      is_frozen?: boolean;
    },
  ) {
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('profiles')
      .select(
        'id, email, full_name, role, onboarding_status, is_active, is_frozen, created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Aplicar filtros opcionales
    if (filters?.role) {
      query = query.eq('role', filters.role);
    }
    if (filters?.onboarding_status) {
      query = query.eq('onboarding_status', filters.onboarding_status);
    }
    if (filters?.is_frozen !== undefined) {
      query = query.eq('is_frozen', filters.is_frozen);
    }

    const { data, error, count } = await query;

    if (error) throw new BadRequestException(error.message);

    return {
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Retorna el perfil completo de un usuario por su ID.
   * Solo accesible por admin/staff.
   */
  async findById(targetId: string): Promise<ProfileResponseDto> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .single();

    if (error || !data)
      throw new NotFoundException(`Usuario ${targetId} no encontrado`);
    return data as ProfileResponseDto;
  }

  /**
   * Congela o descongela una cuenta de usuario.
   * Registra la acción en audit_logs.
   */
  async freezeAccount(
    targetId: string,
    freeze: boolean,
    reason: string | undefined,
    actorId: string,
  ): Promise<ProfileResponseDto> {
    if (freeze && !reason) {
      throw new BadRequestException(
        'Se requiere un motivo para congelar la cuenta',
      );
    }

    const updatePayload: Record<string, unknown> = {
      is_frozen: freeze,
      frozen_reason: freeze ? reason : null,
      frozen_at: freeze ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetId)
      .select()
      .single();

    if (error || !data)
      throw new NotFoundException(`Usuario ${targetId} no encontrado`);

    // Registrar en audit_logs
    await this.supabase.from('audit_logs').insert({
      actor_id: actorId,
      action: freeze ? 'account_frozen' : 'account_unfrozen',
      entity_type: 'profile',
      entity_id: targetId,
      details: { reason: reason ?? null },
    });

    this.logger.log(
      `Cuenta ${targetId} ${freeze ? 'congelada' : 'descongelada'} por ${actorId}`,
    );

    return data as ProfileResponseDto;
  }

  /**
   * Activa o desactiva una cuenta de usuario.
   * Registra la acción en audit_logs.
   */
  async toggleActive(
    targetId: string,
    isActive: boolean,
    actorId: string,
  ): Promise<ProfileResponseDto> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetId)
      .select()
      .single();

    if (error || !data)
      throw new NotFoundException(`Usuario ${targetId} no encontrado`);

    // Registrar en audit_logs
    await this.supabase.from('audit_logs').insert({
      actor_id: actorId,
      action: isActive ? 'account_activated' : 'account_deactivated',
      entity_type: 'profile',
      entity_id: targetId,
      details: {},
    });

    this.logger.log(
      `Cuenta ${targetId} ${isActive ? 'activada' : 'desactivada'} por ${actorId}`,
    );

    return data as ProfileResponseDto;
  }
}
