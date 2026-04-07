import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';
import { BridgeService } from '../bridge/bridge.service';

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly bridgeService: BridgeService,
  ) {}

  /** Crea un proveedor para el usuario. */
  async create(userId: string, dto: CreateSupplierDto) {
    const isFiat = dto.payment_rail !== 'crypto';

    let bridge_external_account_id: string | null = null;

    if (isFiat) {
      // Registrar cuenta externa en Bridge (valida KYC internamente)
      const ea = await this.bridgeService.createExternalAccount(userId, {
        account_owner_name: dto.name,
        currency: dto.currency.toLowerCase(),
        payment_rail: dto.payment_rail,
        bank_name: dto.bank_name,
        country: dto.country,
        // ACH/Wire
        account_number: dto.account_number,
        routing_number: dto.routing_number,
        checking_or_savings: dto.checking_or_savings as 'checking' | 'savings',
        address: dto.address,
        // SEPA
        iban: dto.iban,
        swift_bic: dto.swift_bic,
        iban_country: dto.iban_country,
        account_owner_type: dto.account_owner_type as 'individual' | 'business',
        first_name: dto.first_name,
        last_name: dto.last_name,
        business_name: dto.business_name,
        // SPEI
        clabe: dto.clabe,
        // PIX
        pix_key: dto.pix_key,
        br_code: dto.br_code,
        document_number: dto.document_number,
        // Bre-B
        bre_b_key: dto.bre_b_key,
      });

      bridge_external_account_id = ea.id;
    }

    const bank_details = isFiat
      ? {
          account_number: dto.account_number,
          routing_number: dto.routing_number,
          checking_or_savings: dto.checking_or_savings,
          iban: dto.iban,
          swift_bic: dto.swift_bic,
          clabe: dto.clabe,
          pix_key: dto.pix_key,
          br_code: dto.br_code,
          bre_b_key: dto.bre_b_key,
        }
      : {
          wallet_address: dto.wallet_address,
          wallet_network: dto.wallet_network,
        };

    // Limpiar nulos/undefined visualmente
    Object.keys(bank_details).forEach(
      (k) => bank_details[k as keyof typeof bank_details] === undefined && delete bank_details[k as keyof typeof bank_details]
    );

    const { data, error } = await this.supabase
      .from('suppliers')
      .insert({
        user_id: userId,
        name: dto.name,
        country: dto.country,
        currency: dto.currency.toLowerCase(),
        payment_rail: dto.payment_rail,
        bank_details,
        contact_email: dto.contact_email ?? null,
        notes: dto.notes ?? null,
        bridge_external_account_id,
        is_active: true,
        is_verified: false,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Lista proveedores activos del usuario. */
  async findAll(userId: string) {
    const { data, error } = await this.supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name');

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Detalle de un proveedor. */
  async findOne(supplierId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .eq('user_id', userId)
      .single();

    if (error || !data)
      throw new NotFoundException('Proveedor no encontrado');
    return data;
  }

  /** Actualiza un proveedor. */
  async update(
    supplierId: string,
    userId: string,
    dto: UpdateSupplierDto,
  ) {
    // Verificar propiedad
    await this.findOne(supplierId, userId);

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.currency !== undefined)
      updateData.currency = dto.currency.toLowerCase();
    if (dto.payment_rail !== undefined)
      updateData.payment_rail = dto.payment_rail;
    if (dto.contact_email !== undefined)
      updateData.contact_email = dto.contact_email;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const { data, error } = await this.supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Desactiva (soft delete) un proveedor. */
  async remove(supplierId: string, userId: string) {
    await this.findOne(supplierId, userId);

    await this.supabase
      .from('suppliers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', supplierId)
      .eq('user_id', userId);

    return { message: 'Proveedor desactivado' };
  }
}
