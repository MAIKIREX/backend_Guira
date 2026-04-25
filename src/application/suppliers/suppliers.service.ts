import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/create-supplier.dto';
import { BridgeService } from '../bridge/bridge.service';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

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
        checking_or_savings: dto.checking_or_savings,
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
        // FPS
        sort_code: dto.sort_code,
        // CO Bank Transfer
        bank_code: dto.bank_code,
        document_type: dto.document_type,
        phone_number: dto.phone_number,
      });

      bridge_external_account_id = ea.id;
    }

    const bank_details = isFiat
      ? {
          bank_name: dto.bank_name,
          account_number: dto.account_number,
          routing_number: dto.routing_number,
          checking_or_savings: dto.checking_or_savings,
          iban: dto.iban,
          swift_bic: dto.swift_bic,
          iban_country: dto.iban_country,
          clabe: dto.clabe,
          pix_key: dto.pix_key,
          br_code: dto.br_code,
          document_number: dto.document_number,
          bre_b_key: dto.bre_b_key,
          sort_code: dto.sort_code,
          bank_code: dto.bank_code,
          document_type: dto.document_type,
          phone_number: dto.phone_number,
          account_owner_type: dto.account_owner_type,
          first_name: dto.first_name,
          last_name: dto.last_name,
          business_name: dto.business_name,
          address: dto.address ?? null,
          bank_country: dto.country,
        }
      : {
          wallet_address: dto.wallet_address,
          wallet_network: dto.wallet_network?.toLowerCase(),
          wallet_currency: dto.wallet_currency?.toLowerCase(),
        };

    // Para crypto, la moneda del proveedor es el token (usdc, usdt, etc.),
    // no una moneda fiat como USD.
    const supplierCurrency = isFiat
      ? dto.currency.toLowerCase()
      : (dto.wallet_currency?.toLowerCase() ?? dto.currency.toLowerCase());

    // Limpiar nulos/undefined visualmente
    Object.keys(bank_details).forEach(
      (k) =>
        bank_details[k as keyof typeof bank_details] === undefined &&
        delete bank_details[k as keyof typeof bank_details],
    );

    const { data, error } = await this.supabase
      .from('suppliers')
      .insert({
        user_id: userId,
        name: dto.name,
        country: dto.country,
        currency: supplierCurrency,
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
      .select('*, bridge_external_accounts ( bank_name, country )')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name');

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((supplier) =>
      this.mapBridgeDetailsToBankDetails(supplier),
    );
  }

  /** Detalle de un proveedor. */
  async findOne(supplierId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('suppliers')
      .select('*, bridge_external_accounts ( bank_name, country )')
      .eq('id', supplierId)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Proveedor no encontrado');
    return this.mapBridgeDetailsToBankDetails(data);
  }

  private mapBridgeDetailsToBankDetails(supplier: any) {
    if (supplier.bridge_external_accounts) {
      if (!supplier.bank_details) supplier.bank_details = {};
      const { bank_name, country } = supplier.bridge_external_accounts;
      if (bank_name && !supplier.bank_details.bank_name) {
        supplier.bank_details.bank_name = bank_name;
      }
      if (country && !supplier.bank_details.bank_country) {
        supplier.bank_details.bank_country = country;
      }
    }
    delete supplier.bridge_external_accounts;
    return supplier;
  }

  /** Actualiza un proveedor. Sincroniza con Bridge cuando aplica. */
  async update(supplierId: string, userId: string, dto: UpdateSupplierDto) {
    // Verificar propiedad y obtener datos actuales
    const existing = await this.findOne(supplierId, userId);

    // ── Bloquear edición de campos bancarios inmutables si hay EA en Bridge ──
    // Bridge Update API solo permite: address + US account (routing_number, checking_or_savings)
    // Para cambiar iban, clabe, pix_key, account_number, etc. se debe crear un proveedor nuevo.
    const hasBridgeEA = !!existing.bridge_external_account_id;
    if (hasBridgeEA) {
      const immutableFields = [
        'iban', 'swift_bic', 'iban_country', 'clabe',
        'pix_key', 'br_code', 'bre_b_key', 'account_number',
      ] as const;

      const blockedFields = immutableFields.filter(
        (f) => dto[f] !== undefined && dto[f] !== (existing.bank_details?.[f] as string),
      );

      if (blockedFields.length > 0) {
        throw new BadRequestException(
          `No se pueden modificar los campos bancarios [${blockedFields.join(', ')}] ` +
            'porque este proveedor ya tiene una cuenta registrada en Bridge. ' +
            'Crea un proveedor nuevo con los datos actualizados.',
        );
      }
    }

    // ── Construir updateData para DB ──
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

    // Si es crypto y se actualiza wallet_currency, actualizar currency también
    if (
      dto.wallet_currency !== undefined &&
      existing.payment_rail === 'crypto'
    ) {
      updateData.currency = dto.wallet_currency.toLowerCase();
    }

    // Actualizar bank_details si hay campos bancarios/crypto en el DTO
    const bankFieldsToMerge: Record<string, unknown> = {};
    if (dto.bank_name !== undefined) bankFieldsToMerge.bank_name = dto.bank_name;
    if (dto.routing_number !== undefined) bankFieldsToMerge.routing_number = dto.routing_number;
    if (dto.checking_or_savings !== undefined) bankFieldsToMerge.checking_or_savings = dto.checking_or_savings;
    if (dto.wallet_address !== undefined) bankFieldsToMerge.wallet_address = dto.wallet_address;
    if (dto.wallet_network !== undefined) bankFieldsToMerge.wallet_network = dto.wallet_network.toLowerCase();
    if (dto.wallet_currency !== undefined) bankFieldsToMerge.wallet_currency = dto.wallet_currency.toLowerCase();

    if (Object.keys(bankFieldsToMerge).length > 0) {
      updateData.bank_details = {
        ...(existing.bank_details as Record<string, unknown> ?? {}),
        ...bankFieldsToMerge,
      };
    }

    // ── Sincronizar con Bridge si aplica (S-6) ──
    // Bridge PUT solo acepta: address (requerido) + account (US: routing_number, checking_or_savings)
    if (hasBridgeEA && dto.address) {
      try {
        await this.bridgeService.updateExternalAccount(
          userId,
          existing.bridge_external_account_id!,
          {
            address: dto.address,
            // Solo para US: routing_number y checking_or_savings
            ...(existing.payment_rail === 'ach' || existing.payment_rail === 'wire'
              ? {
                  account: {
                    ...(dto.routing_number ? { routing_number: dto.routing_number } : {}),
                    ...(dto.checking_or_savings ? { checking_or_savings: dto.checking_or_savings as 'checking' | 'savings' } : {}),
                  },
                }
              : {}),
          },
        );
      } catch (err) {
        // Log pero no bloquear — la DB local se actualiza igualmente
        this.logger.warn(
          `Bridge update para EA ${existing.bridge_external_account_id} falló: ${err.message}`,
        );
      }
    }

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
