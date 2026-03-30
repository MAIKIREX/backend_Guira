import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  // ───────────────────────────────────────────────
  //  Endpoints públicos
  // ───────────────────────────────────────────────

  /** Lista tarifas vigentes (solo activas + públicas). */
  async getPublicFees() {
    const { data, error } = await this.supabase
      .from('fees_config')
      .select('operation_type, payment_rail, currency, fee_type, fee_percent, fee_fixed, min_fee, max_fee, description')
      .eq('is_active', true)
      .order('operation_type');

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  // ───────────────────────────────────────────────
  //  Admin — CRUD de tarifas
  // ───────────────────────────────────────────────

  /** Lista todas las tarifas (activas e inactivas). */
  async getAllFees() {
    const { data, error } = await this.supabase
      .from('fees_config')
      .select('*')
      .order('operation_type');

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Crea una nueva tarifa. */
  async createFee(dto: {
    operation_type: string;
    payment_rail: string;
    currency: string;
    fee_type: string;
    fee_percent?: number;
    fee_fixed?: number;
    min_fee?: number;
    max_fee?: number;
    description?: string;
  }) {
    const { data, error } = await this.supabase
      .from('fees_config')
      .insert({
        ...dto,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Actualiza una tarifa existente. */
  async updateFee(
    feeId: string,
    dto: {
      fee_type?: string;
      fee_percent?: number;
      fee_fixed?: number;
      min_fee?: number;
      max_fee?: number;
      is_active?: boolean;
      description?: string;
    },
  ) {
    const { data, error } = await this.supabase
      .from('fees_config')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', feeId)
      .select()
      .single();

    if (error || !data)
      throw new NotFoundException('Tarifa no encontrada');
    return data;
  }

  // ───────────────────────────────────────────────
  //  Overrides por cliente
  // ───────────────────────────────────────────────

  /** Obtiene overrides de fee para un usuario. */
  async getOverrides(userId: string) {
    const { data, error } = await this.supabase
      .from('customer_fee_overrides')
      .select('*')
      .eq('user_id', userId)
      .order('operation_type');

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Crea un override de fee para un cliente VIP. */
  async createOverride(
    dto: {
      user_id: string;
      operation_type: string;
      payment_rail?: string;
      currency?: string;
      fee_type: string;
      fee_percent?: number;
      fee_fixed?: number;
      min_fee?: number;
      max_fee?: number;
      valid_from?: string;
      valid_until?: string;
      notes?: string;
    },
    actorId: string,
  ) {
    const { data, error } = await this.supabase
      .from('customer_fee_overrides')
      .insert({
        ...dto,
        is_active: true,
        created_by: actorId,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Audit log
    await this.supabase.from('audit_logs').insert({
      actor_id: actorId,
      action: 'fee_override_created',
      entity_type: 'customer_fee_override',
      entity_id: data.id,
      details: {
        user_id: dto.user_id,
        operation_type: dto.operation_type,
        fee_type: dto.fee_type,
      },
    });

    return data;
  }

  // ───────────────────────────────────────────────
  //  Servicio  interno — Cálculo de fee
  // ───────────────────────────────────────────────

  /**
   * Calcula el fee para una operación, considerando overrides del cliente.
   * Retorna fee_amount y net_amount.
   */
  async calculateFee(
    userId: string,
    operationType: string,
    paymentRail: string,
    amount: number,
  ): Promise<{ fee_amount: number; net_amount: number }> {
    const today = new Date().toISOString().split('T')[0];

    // 1. Buscar override del cliente
    const { data: override } = await this.supabase
      .from('customer_fee_overrides')
      .select('*')
      .eq('user_id', userId)
      .eq('operation_type', operationType)
      .eq('is_active', true)
      .lte('valid_from', today)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .maybeSingle();

    // 2. Si no hay override, usar tarifa global
    let feeConfig = override;
    if (!feeConfig) {
      const { data: globalFee } = await this.supabase
        .from('fees_config')
        .select('*')
        .eq('operation_type', operationType)
        .eq('payment_rail', paymentRail)
        .eq('is_active', true)
        .maybeSingle();

      feeConfig = globalFee;
    }

    if (!feeConfig) {
      // No hay tarifa configurada — sin fee
      return { fee_amount: 0, net_amount: amount };
    }

    // 3. Calcular
    let fee = 0;
    const feePercent = parseFloat(feeConfig.fee_percent ?? '0');
    const feeFixed = parseFloat(feeConfig.fee_fixed ?? '0');

    if (feeConfig.fee_type === 'percent') {
      fee = amount * (feePercent / 100);
    } else if (feeConfig.fee_type === 'fixed') {
      fee = feeFixed;
    } else if (feeConfig.fee_type === 'mixed') {
      fee = feeFixed + amount * (feePercent / 100);
    }

    // 4. Aplicar min/max
    const minFee = parseFloat(feeConfig.min_fee ?? '0');
    const maxFee = parseFloat(feeConfig.max_fee ?? '0');
    if (minFee > 0) fee = Math.max(fee, minFee);
    if (maxFee > 0) fee = Math.min(fee, maxFee);

    return {
      fee_amount: parseFloat(fee.toFixed(2)),
      net_amount: parseFloat((amount - fee).toFixed(2)),
    };
  }
}
