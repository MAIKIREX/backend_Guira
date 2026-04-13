import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { BridgeApiClient } from './bridge-api.client';
import { FeesService } from '../fees/fees.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreatePayoutRequestDto } from './dto/create-payout.dto';
import {
  CreateVirtualAccountDto,
  CreateExternalAccountDto,
  CreateLiquidationAddressDto,
} from './dto/create-virtual-account.dto';

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly bridgeApi: BridgeApiClient,
    private readonly feesService: FeesService,
    private readonly ledgerService: LedgerService,
  ) {}

  // ═══════════════════════════════════════════════════
  //  VIRTUAL ACCOUNTS (depósitos entrantes)
  // ═══════════════════════════════════════════════════

  /** Crea Virtual Account en Bridge + guarda en DB. */
  async createVirtualAccount(userId: string, dto: CreateVirtualAccountDto) {
    const profile = await this.getVerifiedProfile(userId);

    // Validación: no pueden venir ambos destinos a la vez
    if (dto.destination_wallet_id && dto.destination_address) {
      throw new BadRequestException(
        'No puedes especificar destination_wallet_id y destination_address al mismo tiempo. ' +
          'Usa destination_wallet_id para fondear tu wallet en Guira, o destination_address para enviar a una wallet externa (Binance, MetaMask, etc.).',
      );
    }

    // Verificar duplicados
    const { data: existing } = await this.supabase
      .from('bridge_virtual_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('source_currency', dto.source_currency.toLowerCase())
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      throw new BadRequestException(
        `Ya tienes una cuenta virtual activa para ${dto.source_currency}`,
      );
    }

    // ── Determinar destino ──────────────────────────────
    // Caso A: Wallet interna de Guira (fondos se quedan en plataforma)
    // Caso B: Wallet externa (Binance, MetaMask, etc.) — fondos salen de Guira
    // Caso C: Ninguno especificado — default a wallet interna del usuario
    let destinationAddress: string | undefined;
    let isExternalSweep = false;

    if (dto.destination_address) {
      // ── Caso B: Wallet externa ──
      destinationAddress = dto.destination_address;
      isExternalSweep = true;
      this.logger.log(
        `VA con destino externo para user ${userId}: ${dto.destination_address} (${dto.destination_label ?? 'sin etiqueta'})`,
      );
    } else if (dto.destination_wallet_id) {
      // ── Caso A: Wallet interna ──
      const { data: wallet } = await this.supabase
        .from('wallets')
        .select('address')
        .eq('id', dto.destination_wallet_id)
        .eq('user_id', userId)
        .single();
      destinationAddress = wallet?.address;
    }

    // ── Determinar developer_fee_percent ──────────────────
    // Si el DTO lo trae, usar ese valor; sino leer de fees_config
    let devFeePercent: string | undefined;
    if (dto.developer_fee_percent !== undefined) {
      devFeePercent = dto.developer_fee_percent.toString();
    } else {
      // Fallback: leer fee por defecto de app_settings
      const { data: feeSetting } = await this.supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'DEFAULT_VA_FEE_PERCENT')
        .maybeSingle();
      devFeePercent = feeSetting?.value ?? undefined;
    }

    // ── Crear en Bridge (formato anidado source/destination) ──
    const bridgePayload: Record<string, unknown> = {
      source: { currency: dto.source_currency.toLowerCase() },
      destination: {
        payment_rail: dto.destination_payment_rail,
        currency: dto.destination_currency.toLowerCase(),
        ...(destinationAddress ? { address: destinationAddress } : {}),
      },
    };

    // Solo enviar developer_fee_percent si tiene valor
    if (devFeePercent) {
      bridgePayload.developer_fee_percent = devFeePercent;
    }

    const bridgeVA = await this.bridgeApi.post<Record<string, unknown>>(
      `/v0/customers/${profile.bridge_customer_id}/virtual_accounts`,
      bridgePayload,
      `va-${userId}-${dto.source_currency}-${Date.now()}`,
    );

    // ── Extraer TODOS los campos de source_deposit_instructions ──
    const sdi =
      (bridgeVA.source_deposit_instructions as Record<string, unknown>) ?? {};
    const bridgeDest = (bridgeVA.destination as Record<string, unknown>) ?? {};

    // Guardar en DB con todos los campos de la respuesta de Bridge
    const { data, error } = await this.supabase
      .from('bridge_virtual_accounts')
      .insert({
        user_id: userId,
        bridge_virtual_account_id: bridgeVA.id,
        bridge_customer_id: profile.bridge_customer_id,
        source_currency: dto.source_currency.toLowerCase(),
        destination_currency: dto.destination_currency.toLowerCase(),
        destination_payment_rail: dto.destination_payment_rail,
        destination_address:
          (bridgeDest.address as string) ?? destinationAddress ?? null,
        destination_wallet_id: dto.destination_wallet_id ?? null,
        is_external_sweep: isExternalSweep,
        external_destination_label: dto.destination_label ?? null,
        // ── Campos de source_deposit_instructions (respuesta de Bridge) ──
        bank_name: (sdi.bank_name as string) ?? null,
        bank_address: (sdi.bank_address as string) ?? null,
        beneficiary_name: (sdi.bank_beneficiary_name as string) ?? null,
        beneficiary_address: (sdi.bank_beneficiary_address as string) ?? null,
        routing_number: (sdi.bank_routing_number as string) ?? null,
        account_number: (sdi.bank_account_number as string) ?? null,
        // Campos multi-divisa (Bridge los devuelve según source_currency)
        iban: (sdi.iban as string) ?? null,
        clabe: (sdi.clabe as string) ?? null,
        br_code: (sdi.br_code as string) ?? null,
        sort_code: (sdi.sort_code as string) ?? null,
        payment_rails: (sdi.payment_rails as string[]) ?? null,
        // Titular de la cuenta: presente en EUR (IBAN), MXN (CLABE), BRL (PIX), GBP (FPS) y COP (Bre-B)
        account_holder_name: (sdi.account_holder_name as string) ?? null,
        // Mensaje de depósito: específico de COP/Bre-B — el cliente DEBE incluirlo en la transferencia
        deposit_message: (sdi.deposit_message as string) ?? null,
        // Fee
        developer_fee_percent: devFeePercent ? parseFloat(devFeePercent) : null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Lista virtual accounts del usuario. */
  async listVirtualAccounts(userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_virtual_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at');

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Detalle de una virtual account. */
  async getVirtualAccount(vaId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_virtual_accounts')
      .select('*')
      .eq('id', vaId)
      .eq('user_id', userId)
      .single();

    if (error || !data)
      throw new NotFoundException('Cuenta virtual no encontrada');
    return data;
  }

  /** Desactiva VA en Bridge + DB. */
  async deactivateVirtualAccount(vaId: string, userId: string) {
    const va = await this.getVirtualAccount(vaId, userId);

    if (this.bridgeApi.isConfigured && va.bridge_virtual_account_id) {
      try {
        await this.bridgeApi.delete(
          `/v0/virtual_accounts/${va.bridge_virtual_account_id}`,
        );
      } catch (err) {
        this.logger.warn(`Error desactivando VA en Bridge: ${err}`);
      }
    }

    await this.supabase
      .from('bridge_virtual_accounts')
      .update({ status: 'inactive', deactivated_at: new Date().toISOString() })
      .eq('id', vaId);

    return { message: 'Cuenta virtual desactivada' };
  }

  // ═══════════════════════════════════════════════════
  //  EXTERNAL ACCOUNTS (cuentas bancarias destino)
  // ═══════════════════════════════════════════════════

  /**
   * Registra cuenta bancaria externa en Bridge + guarda en DB.
   *
   * - Deriva `account_type` de Bridge a partir del `payment_rail` del DTO.
   * - Usa `checking_or_savings` (no `account_type`) dentro del objeto `account` para US.
   * - Envía `address` del beneficiario cuando se proporciona (recomendado para US).
   * - Envía `account_owner_type`/`first_name`/`last_name`/`business_name` para IBAN.
   * - Guarda `beneficiary_address_valid` de la respuesta de Bridge.
   */
  async createExternalAccount(userId: string, dto: CreateExternalAccountDto) {
    const profile = await this.getVerifiedProfile(userId);

    // Validar longitud de account_owner_name para ACH/Wire (Bridge exige 3-35)
    if (
      (dto.payment_rail === 'ach' || dto.payment_rail === 'wire') &&
      (dto.account_owner_name.length < 3 || dto.account_owner_name.length > 35)
    ) {
      throw new BadRequestException(
        'Para transferencias ACH/Wire, account_owner_name debe tener entre 3 y 35 caracteres.',
      );
    }

    // Derivar account_type de Bridge desde payment_rail
    const bridgeAccountType = this.getBridgeAccountType(dto.payment_rail);

    // ── Construir payload base ──
    const bridgePayload: Record<string, unknown> = {
      account_owner_name: dto.account_owner_name,
      account_type: bridgeAccountType,
      currency: dto.currency,
    };

    // bank_name es opcional
    if (dto.bank_name) {
      bridgePayload.bank_name = dto.bank_name;
    }

    // Helper inline: convierte código de país alpha-2 → alpha-3 (ISO 3166-1)
    // Bridge requiere alpha-3 en todos los campos "country" de direcciones.
    const toAlpha3 = (code: string | undefined): string | undefined => {
      if (!code) return undefined;
      if (code.length === 3) return code.toUpperCase(); // ya está en alpha-3
      const map: Record<string, string> = {
        US: 'USA',
        MX: 'MEX',
        BR: 'BRA',
        CO: 'COL',
        AR: 'ARG',
        CL: 'CHL',
        PE: 'PER',
        EC: 'ECU',
        BO: 'BOL',
        PY: 'PRY',
        UY: 'URY',
        VE: 'VEN',
        DE: 'DEU',
        FR: 'FRA',
        ES: 'ESP',
        IT: 'ITA',
        NL: 'NLD',
        GB: 'GBR',
        PT: 'PRT',
        BE: 'BEL',
        AT: 'AUT',
        CH: 'CHE',
        SE: 'SWE',
        NO: 'NOR',
        DK: 'DNK',
        FI: 'FIN',
        PL: 'POL',
        IE: 'IRL',
        CZ: 'CZE',
        HU: 'HUN',
        RO: 'ROU',
        SK: 'SVK',
        HR: 'HRV',
        BG: 'BGR',
        LT: 'LTU',
        LV: 'LVA',
        EE: 'EST',
        SI: 'SVN',
        LU: 'LUX',
        MT: 'MLT',
        CY: 'CYP',
        GR: 'GRC',
        CN: 'CHN',
        JP: 'JPN',
        KR: 'KOR',
        IN: 'IND',
        SG: 'SGP',
        AU: 'AUS',
        NZ: 'NZL',
        CA: 'CAN',
        ZA: 'ZAF',
        NG: 'NGA',
        KE: 'KEN',
        GH: 'GHA',
      };
      return map[code.toUpperCase()] ?? code.toUpperCase();
    };

    // ── Campos específicos según payment rail ──
    if (dto.payment_rail === 'ach' || dto.payment_rail === 'wire') {
      // US: datos dentro del objeto `account`
      bridgePayload.account = {
        account_number: dto.account_number,
        routing_number: dto.routing_number,
        checking_or_savings: dto.checking_or_savings ?? 'checking',
      };

      // Dirección del beneficiario (recomendada para US)
      if (dto.address) {
        bridgePayload.address = {
          street_line_1: dto.address.street_line_1,
          ...(dto.address.street_line_2
            ? { street_line_2: dto.address.street_line_2 }
            : {}),
          city: dto.address.city,
          ...(dto.address.state ? { state: dto.address.state } : {}),
          ...(dto.address.postal_code
            ? { postal_code: dto.address.postal_code }
            : {}),
          country: toAlpha3(dto.address.country), // ← FIX: alpha-2 → alpha-3
        };
      }
    } else if (dto.payment_rail === 'sepa') {
      // IBAN: Bridge espera propiedad raíz "iban" (NO "account")
      bridgePayload.iban = {
        account_number: dto.iban,
        bic: dto.swift_bic,
        ...(dto.iban_country ? { country: dto.iban_country } : {}),
      };

      // owner_type/name fields (opcionales según Bridge, pero recomendados)
      if (dto.account_owner_type) {
        bridgePayload.account_owner_type = dto.account_owner_type;
        if (dto.account_owner_type === 'individual') {
          if (dto.first_name) bridgePayload.first_name = dto.first_name;
          if (dto.last_name) bridgePayload.last_name = dto.last_name;
        } else if (dto.account_owner_type === 'business') {
          if (dto.business_name)
            bridgePayload.business_name = dto.business_name;
        }
      }

      // Dirección del beneficiario (opcional para IBAN)
      if (dto.address) {
        bridgePayload.address = {
          street_line_1: dto.address.street_line_1,
          ...(dto.address.street_line_2
            ? { street_line_2: dto.address.street_line_2 }
            : {}),
          city: dto.address.city,
          ...(dto.address.state ? { state: dto.address.state } : {}),
          ...(dto.address.postal_code
            ? { postal_code: dto.address.postal_code }
            : {}),
          country: toAlpha3(dto.address.country), // ← FIX: alpha-2 → alpha-3
        };
      }
    } else if (dto.payment_rail === 'spei') {
      // CLABE (México): Bridge espera propiedad raíz "clabe" con "account_number"
      bridgePayload.clabe = {
        account_number: dto.clabe,
      };

      // owner info (opcional pero recomendado según ejemplos Bridge)
      if (dto.account_owner_type) {
        bridgePayload.account_owner_type = dto.account_owner_type;
        if (dto.account_owner_type === 'individual') {
          if (dto.first_name) bridgePayload.first_name = dto.first_name;
          if (dto.last_name) bridgePayload.last_name = dto.last_name;
        } else if (dto.account_owner_type === 'business') {
          if (dto.business_name)
            bridgePayload.business_name = dto.business_name;
        }
      }

      // Dirección (opcional)
      if (dto.address) {
        bridgePayload.address = {
          street_line_1: dto.address.street_line_1,
          ...(dto.address.street_line_2
            ? { street_line_2: dto.address.street_line_2 }
            : {}),
          city: dto.address.city,
          ...(dto.address.state ? { state: dto.address.state } : {}),
          ...(dto.address.postal_code
            ? { postal_code: dto.address.postal_code }
            : {}),
          country: toAlpha3(dto.address.country), // ← FIX: alpha-2 → alpha-3
        };
      }
    } else if (dto.payment_rail === 'pix') {
      // PIX (Brasil): Bridge distingue "pix_key" y "br_code" como propiedades raíz
      if (dto.pix_key) {
        bridgePayload.pix_key = {
          pix_key: dto.pix_key,
          ...(dto.document_number
            ? { document_number: dto.document_number }
            : {}),
        };
      } else if (dto.br_code) {
        bridgePayload.br_code = {
          br_code: dto.br_code,
          ...(dto.document_number
            ? { document_number: dto.document_number }
            : {}),
        };
      }

      // owner info (opcional pero recomendado según ejemplos Bridge)
      if (dto.account_owner_type) {
        bridgePayload.account_owner_type = dto.account_owner_type;
        if (dto.account_owner_type === 'individual') {
          if (dto.first_name) bridgePayload.first_name = dto.first_name;
          if (dto.last_name) bridgePayload.last_name = dto.last_name;
        } else if (dto.account_owner_type === 'business') {
          if (dto.business_name)
            bridgePayload.business_name = dto.business_name;
        }
      }

      // Dirección (opcional)
      if (dto.address) {
        bridgePayload.address = {
          street_line_1: dto.address.street_line_1,
          ...(dto.address.street_line_2
            ? { street_line_2: dto.address.street_line_2 }
            : {}),
          city: dto.address.city,
          ...(dto.address.state ? { state: dto.address.state } : {}),
          ...(dto.address.postal_code
            ? { postal_code: dto.address.postal_code }
            : {}),
          country: toAlpha3(dto.address.country), // ← FIX: alpha-2 → alpha-3
        };
      }
    } else if (dto.payment_rail === 'bre_b') {
      // Bre-B (Colombia): Bridge espera propiedad raíz "account" con "bre_b_key"
      bridgePayload.account = {
        bre_b_key: dto.bre_b_key,
      };
    }

    // ── Llamar Bridge API ──
    const bridgeEA = await this.bridgeApi.post<Record<string, unknown>>(
      `/v0/customers/${profile.bridge_customer_id}/external_accounts`,
      bridgePayload,
      `ea-${userId}-${Date.now()}`,
    );

    // Extraer datos de respuesta de Bridge (la estructura varía por rail)
    const bridgeAccount = bridgeEA.account as
      | Record<string, unknown>
      | undefined;
    const bridgeIban = bridgeEA.iban as Record<string, unknown> | undefined;
    const bridgeClabe = bridgeEA.clabe as Record<string, unknown> | undefined;
    const bridgePixKey = bridgeEA.pix_key as
      | Record<string, unknown>
      | undefined;
    const bridgeBrCode = bridgeEA.br_code as
      | Record<string, unknown>
      | undefined;

    // ── Guardar en DB ──
    const { data, error } = await this.supabase
      .from('bridge_external_accounts')
      .insert({
        user_id: userId,
        bridge_external_account_id: bridgeEA.id,
        bridge_customer_id: profile.bridge_customer_id,
        bank_name: dto.bank_name ?? (bridgeEA.bank_name as string) ?? null,
        account_name: dto.account_owner_name,
        account_last_4:
          (bridgeAccount?.last_4 as string) ??
          (bridgeIban?.last_4 as string) ??
          (bridgeClabe?.last_4 as string) ??
          (bridgePixKey?.account_preview as string)?.slice(-4) ??
          (bridgeBrCode?.account_preview as string)?.slice(-4) ??
          (
            dto.account_number ??
            dto.iban ??
            dto.clabe ??
            dto.pix_key ??
            dto.br_code ??
            dto.bre_b_key ??
            ''
          ).slice(-4),
        currency: dto.currency.toLowerCase(),
        payment_rail: dto.payment_rail,
        account_type: dto.checking_or_savings ?? null,
        routing_number: dto.routing_number ?? null,
        iban: dto.iban ?? null,
        swift_bic: dto.swift_bic ?? null,
        country: dto.country ?? null,
        is_active: (bridgeEA.active as boolean) ?? true,
        // Nuevos campos de la respuesta de Bridge
        beneficiary_address_valid:
          (bridgeEA.beneficiary_address_valid as boolean) ?? null,
        account_owner_type: dto.account_owner_type ?? null,
        first_name: dto.first_name ?? null,
        last_name: dto.last_name ?? null,
        business_name: dto.business_name ?? null,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** Lista cuentas externas activas. */
  async listExternalAccounts(userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_external_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Desactiva cuenta externa. */
  async deactivateExternalAccount(eaId: string, userId: string) {
    const { data: ea } = await this.supabase
      .from('bridge_external_accounts')
      .select('bridge_external_account_id')
      .eq('id', eaId)
      .eq('user_id', userId)
      .single();

    if (!ea) throw new NotFoundException('Cuenta externa no encontrada');

    await this.supabase
      .from('bridge_external_accounts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', eaId);

    return { message: 'Cuenta externa desactivada' };
  }

  // ═══════════════════════════════════════════════════
  //  PAYOUTS (pagos salientes — refactor completo)
  // ═══════════════════════════════════════════════════

  /** Crea solicitud de pago con validación completa y reserva de saldo. */
  async createPayout(userId: string, dto: CreatePayoutRequestDto) {
    // 1. Validar perfil
    const profile = await this.getVerifiedProfile(userId);

    // 2. Calcular fee
    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'payout',
      dto.payment_rail,
      dto.amount,
    );
    const totalAmount = dto.amount + fee_amount;

    // 3. Verificar saldo
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_amount')
      .eq('user_id', userId)
      .eq('currency', dto.currency.toUpperCase())
      .single();

    const available = parseFloat(balance?.available_amount ?? '0');
    if (available < totalAmount) {
      throw new BadRequestException(
        `Saldo insuficiente. Disponible: ${available}, Requerido: ${totalAmount} (monto ${dto.amount} + fee ${fee_amount})`,
      );
    }

    // 4. Verificar límites de transacción
    await this.verifyTransactionLimits(userId, dto.amount);

    // 5. Reservar saldo
    await this.supabase.rpc('reserve_balance', {
      p_user_id: userId,
      p_currency: dto.currency.toUpperCase(),
      p_amount: totalAmount,
    });

    // 6. Crear payout_request
    const idempotencyKey = `payout-${userId}-${Date.now()}-${crypto.randomUUID()}`;

    const { data: payoutReq, error } = await this.supabase
      .from('payout_requests')
      .insert({
        user_id: userId,
        wallet_id: dto.wallet_id,
        bridge_external_account_id: dto.bridge_external_account_id ?? null,
        supplier_id: dto.supplier_id ?? null,
        payment_rail: dto.payment_rail,
        amount: dto.amount,
        fee_amount,
        net_amount,
        currency: dto.currency.toUpperCase(),
        idempotency_key: idempotencyKey,
        business_purpose: dto.business_purpose,
        notes: dto.notes ?? null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      // Liberar saldo si falla
      await this.releaseReservedBalance(userId, dto.currency, totalAmount);
      throw new BadRequestException(error.message);
    }

    // 7. ¿Requiere revisión de compliance?
    const threshold = await this.getPayoutReviewThreshold();
    if (dto.amount >= threshold) {
      await this.createComplianceReview('payout_request', payoutReq.id, userId);
      return { ...payoutReq, requires_review: true };
    }

    // 8. Auto-aprobar → ejecutar en Bridge
    return this.executePayout(payoutReq.id, profile.bridge_customer_id);
  }

  /** Ejecuta un payout aprobado en Bridge API. */
  async executePayout(payoutRequestId: string, bridgeCustomerId: string) {
    const { data: req, error: reqErr } = await this.supabase
      .from('payout_requests')
      .select('*')
      .eq('id', payoutRequestId)
      .single();

    if (reqErr || !req)
      throw new NotFoundException('Payout request no encontrado');

    // Obtener wallet address
    const { data: wallet } = await this.supabase
      .from('wallets')
      .select('address')
      .eq('id', req.wallet_id)
      .single();

    // Obtener external account ID de Bridge
    let externalAccountBridgeId: string | undefined;
    if (req.bridge_external_account_id) {
      const { data: ea } = await this.supabase
        .from('bridge_external_accounts')
        .select('bridge_external_account_id')
        .eq('id', req.bridge_external_account_id)
        .single();
      externalAccountBridgeId = ea?.bridge_external_account_id;
    }

    // Llamar Bridge Transfer API
    let bridgeTransfer: Record<string, unknown>;
    try {
      bridgeTransfer = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          on_behalf_of: bridgeCustomerId,
          source: {
            payment_rail: 'usdc',
            currency: 'usdc',
            from_address: wallet?.address,
          },
          destination: {
            payment_rail: req.payment_rail,
            currency: req.currency.toLowerCase(),
            external_account_id: externalAccountBridgeId,
          },
          amount: req.amount.toString(),
          developer_fee: (req.fee_amount ?? '0').toString(),
          return_instructions: {
            address: wallet?.address,
          },
        },
        req.idempotency_key,
      );
    } catch (err) {
      // Liberar saldo reservado si Bridge falla
      const totalAmount =
        parseFloat(req.amount) + parseFloat(req.fee_amount ?? '0');
      await this.releaseReservedBalance(req.user_id, req.currency, totalAmount);

      await this.supabase
        .from('payout_requests')
        .update({ status: 'failed' })
        .eq('id', req.id);

      throw err;
    }

    // Guardar bridge_transfer
    await this.supabase.from('bridge_transfers').insert({
      user_id: req.user_id,
      payout_request_id: req.id,
      bridge_transfer_id: bridgeTransfer.id,
      idempotency_key: req.idempotency_key,
      amount: req.amount,
      net_amount: req.net_amount,
      bridge_state: bridgeTransfer.state ?? 'payment_submitted',
      status: 'processing',
      source_payment_rail: 'usdc',
      destination_payment_rail: req.payment_rail,
      destination_currency: req.currency,
      bridge_raw_response: bridgeTransfer,
    });

    // Ledger entry como PENDING (NO settled)
    await this.ledgerService.createEntry({
      wallet_id: req.wallet_id,
      type: 'debit',
      amount: parseFloat(req.amount) + parseFloat(req.fee_amount ?? '0'),
      currency: req.currency,
      status: 'pending',
      reference_type: 'payout_request',
      reference_id: req.id,
      bridge_transfer_id: bridgeTransfer.id as string,
      description: `Pago en proceso — ${req.business_purpose}`,
    });

    // Actualizar payout_request
    await this.supabase
      .from('payout_requests')
      .update({
        status: 'processing',
        bridge_transfer_id: bridgeTransfer.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.id);

    return {
      payout_request_id: req.id,
      bridge_transfer_id: bridgeTransfer.id,
      status: 'processing',
    };
  }

  /** Lista payout requests del usuario. */
  async listPayoutRequests(userId: string) {
    const { data, error } = await this.supabase
      .from('payout_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Detalle de un payout request. */
  async getPayoutRequest(payoutId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('payout_requests')
      .select('*')
      .eq('id', payoutId)
      .eq('user_id', userId)
      .single();

    if (error || !data)
      throw new NotFoundException('Payout request no encontrado');
    return data;
  }

  /** Admin: aprueba un payout pendiente. */
  async approvePayout(payoutId: string, actorId: string) {
    const { data: req } = await this.supabase
      .from('payout_requests')
      .select('*, profiles!payout_requests_user_id_fkey(bridge_customer_id)')
      .eq('id', payoutId)
      .eq('status', 'pending')
      .single();

    if (!req) throw new NotFoundException('Payout pendiente no encontrado');

    const bridgeCustomerId = (
      req.profiles as unknown as { bridge_customer_id: string }
    )?.bridge_customer_id;

    await this.supabase.from('audit_logs').insert({
      actor_id: actorId,
      action: 'payout_approved',
      entity_type: 'payout_request',
      entity_id: payoutId,
      details: { amount: req.amount, currency: req.currency },
    });

    return this.executePayout(payoutId, bridgeCustomerId);
  }

  /** Admin: rechaza un payout pendiente (libera saldo). */
  async rejectPayout(payoutId: string, reason: string, actorId: string) {
    const { data: req } = await this.supabase
      .from('payout_requests')
      .select('*')
      .eq('id', payoutId)
      .eq('status', 'pending')
      .single();

    if (!req) throw new NotFoundException('Payout pendiente no encontrado');

    const totalAmount =
      parseFloat(req.amount) + parseFloat(req.fee_amount ?? '0');
    await this.releaseReservedBalance(req.user_id, req.currency, totalAmount);

    await this.supabase
      .from('payout_requests')
      .update({
        status: 'rejected',
        notes: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payoutId);

    await this.supabase.from('audit_logs').insert({
      actor_id: actorId,
      action: 'payout_rejected',
      entity_type: 'payout_request',
      entity_id: payoutId,
      details: { reason, amount: req.amount },
    });

    return { message: 'Payout rechazado, saldo liberado' };
  }

  // ═══════════════════════════════════════════════════
  //  TRANSFERS (consultas)
  // ═══════════════════════════════════════════════════

  async listTransfers(userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_transfers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Admin: lista TODAS las transferencias Bridge (sin filtro de usuario). */
  async listAllTransfers(filters?: { status?: string }) {
    let query = this.supabase
      .from('bridge_transfers')
      .select(
        '*, profiles!bridge_transfers_user_id_fkey(email, full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);

    // Aplanar el join de profiles para comodidad del frontend
    return (data ?? []).map((t: any) => ({
      ...t,
      user_email: t.profiles?.email ?? null,
      user_full_name: t.profiles?.full_name ?? null,
      profiles: undefined,
    }));
  }

  async getTransfer(transferId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_transfers')
      .select('*')
      .eq('id', transferId)
      .eq('user_id', userId)
      .single();

    if (error || !data)
      throw new NotFoundException('Transferencia no encontrada');
    return data;
  }

  async syncTransferFromBridge(transferId: string, userId: string) {
    const { data: transfer } = await this.supabase
      .from('bridge_transfers')
      .select('bridge_transfer_id')
      .eq('id', transferId)
      .eq('user_id', userId)
      .single();

    if (!transfer) throw new NotFoundException('Transferencia no encontrada');

    const bridgeData = await this.bridgeApi.get<Record<string, unknown>>(
      `/v0/transfers/${transfer.bridge_transfer_id}`,
    );

    await this.supabase
      .from('bridge_transfers')
      .update({
        bridge_state: bridgeData.state,
        bridge_raw_response: bridgeData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transferId);

    return { synced: true, state: bridgeData.state };
  }

  // ═══════════════════════════════════════════════════
  //  LIQUIDATION ADDRESSES
  // ═══════════════════════════════════════════════════

  async createLiquidationAddress(
    userId: string,
    dto: CreateLiquidationAddressDto,
  ) {
    const profile = await this.getVerifiedProfile(userId);

    const bridgeLA = await this.bridgeApi.post<Record<string, unknown>>(
      `/v0/customers/${profile.bridge_customer_id}/liquidation_addresses`,
      {
        currency: dto.currency,
        chain: dto.chain,
        destination_currency: dto.destination_currency,
        destination_payment_rail: dto.destination_payment_rail,
        ...(dto.external_account_id
          ? { external_account_id: dto.external_account_id }
          : {}),
      },
      `la-${userId}-${dto.currency}-${dto.chain}-${Date.now()}`,
    );

    return bridgeLA;
  }

  async listLiquidationAddresses(userId: string) {
    const profile = await this.getVerifiedProfile(userId);
    return this.bridgeApi.get(
      `/v0/customers/${profile.bridge_customer_id}/liquidation_addresses`,
    );
  }

  // ═══════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════

  private async getVerifiedProfile(userId: string) {
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .select('bridge_customer_id, onboarding_status, is_frozen, is_active')
      .eq('id', userId)
      .single();

    if (error || !profile) throw new NotFoundException('Perfil no encontrado');
    if (!profile.is_active) throw new ForbiddenException('Cuenta inactiva');
    if (profile.is_frozen) throw new ForbiddenException('Cuenta congelada');
    if (
      profile.onboarding_status !== 'approved' ||
      !profile.bridge_customer_id
    ) {
      throw new BadRequestException(
        'Onboarding incompleto. Completa la verificación KYC/KYB primero.',
      );
    }

    return profile;
  }

  private async releaseReservedBalance(
    userId: string,
    currency: string,
    amount: number,
  ) {
    // Intentar via RPC primero, fallback a update manual
    const { error } = await this.supabase.rpc('release_reserved_balance', {
      p_user_id: userId,
      p_currency: currency.toUpperCase(),
      p_amount: amount,
    });

    if (error) {
      this.logger.warn(
        `RPC release_reserved_balance falló: ${error.message}. Usando fallback manual.`,
      );
      // Fallback: actualización directa
      const { data: balance } = await this.supabase
        .from('balances')
        .select('reserved_amount, available_amount')
        .eq('user_id', userId)
        .eq('currency', currency.toUpperCase())
        .single();

      if (balance) {
        await this.supabase
          .from('balances')
          .update({
            reserved_amount: Math.max(
              0,
              parseFloat(balance.reserved_amount) - amount,
            ),
            available_amount: parseFloat(balance.available_amount) + amount,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('currency', currency.toUpperCase());
      }
    }
  }

  private async verifyTransactionLimits(userId: string, amount: number) {
    const { data: limits } = await this.supabase
      .from('transaction_limits')
      .select('single_txn_limit')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (limits?.single_txn_limit) {
      const limit = parseFloat(limits.single_txn_limit);
      if (amount > limit) {
        throw new BadRequestException(
          `El monto excede tu límite por transacción: $${limit}`,
        );
      }
    }
  }

  private async getPayoutReviewThreshold(): Promise<number> {
    const { data } = await this.supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'PAYOUT_REVIEW_THRESHOLD')
      .single();

    return parseFloat(data?.value ?? '10000');
  }

  private async createComplianceReview(
    entityType: string,
    entityId: string,
    userId: string,
  ) {
    await this.supabase.from('compliance_reviews').insert({
      entity_type: entityType,
      entity_id: entityId,
      status: 'pending',
      requested_by: userId,
    });
  }

  /**
   * Mapea el payment_rail interno de Guira al `account_type` que Bridge espera.
   *
   * Bridge account_type values: us, iban, clabe, pix, bre_b, gb, unknown
   * Guira payment_rail values:  ach, wire, sepa, spei, pix, bre_b
   */
  private getBridgeAccountType(paymentRail: string): string {
    const map: Record<string, string> = {
      ach: 'us',
      wire: 'us',
      sepa: 'iban',
      spei: 'clabe',
      pix: 'pix',
      bre_b: 'bre_b',
    };
    const accountType = map[paymentRail];
    if (!accountType) {
      throw new BadRequestException(
        `Payment rail '${paymentRail}' no tiene un account_type de Bridge mapeado.`,
      );
    }
    return accountType;
  }
}
