import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /** Crea un proveedor para el usuario. */
  async create(userId: string, dto: CreateSupplierDto) {
    const { data, error } = await this.supabase
      .from('suppliers')
      .insert({
        user_id: userId,
        name: dto.name,
        country: dto.country,
        currency: dto.currency.toLowerCase(),
        payment_rail: dto.payment_rail,
        bank_details: dto.bank_details,
        contact_email: dto.contact_email ?? null,
        notes: dto.notes ?? null,
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
    if (dto.bank_details !== undefined)
      updateData.bank_details = dto.bank_details;
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
