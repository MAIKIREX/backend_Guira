import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { FeesService } from '../fees/fees.service';
import { PsavService } from '../psav/psav.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { BridgeApiClient } from '../bridge/bridge-api.client';
import {
  CreateInterbankOrderDto,
  InterbankFlowType,
} from './dto/create-interbank-order.dto';
import {
  CreateWalletRampOrderDto,
  WalletRampFlowType,
} from './dto/create-wallet-ramp-order.dto';
import { ConfirmDepositDto } from './dto/confirm-deposit.dto';
import {
  ApproveOrderDto,
  MarkSentDto,
  CompleteOrderDto,
  FailOrderDto,
} from './dto/admin-order-action.dto';

@Injectable()
export class PaymentOrdersService {
  private readonly logger = new Logger(PaymentOrdersService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly feesService: FeesService,
    private readonly psavService: PsavService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly bridgeApi: BridgeApiClient,
  ) {}

  // ═══════════════════════════════════════════════
  //  RATE LIMITS & VALIDATION
  // ═══════════════════════════════════════════════

  private async validateRateLimit(userId: string): Promise<void> {
    const { data: setting } = await this.supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'MAX_PAYMENT_ORDERS_PER_HOUR')
      .single();

    const maxPerHour = parseInt(setting?.value ?? '5', 10);
    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000,
    ).toISOString();

    const { count } = await this.supabase
      .from('payment_orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo);

    if ((count ?? 0) >= maxPerHour) {
      throw new BadRequestException(
        `Has excedido el límite de ${maxPerHour} órdenes por hora`,
      );
    }
  }

  private async validateAmountLimits(
    amount: number,
    category: 'interbank' | 'wallet_ramp',
  ): Promise<void> {
    const prefix = category === 'interbank' ? 'INTERBANK' : 'RAMP';
    const { data: minSetting } = await this.supabase
      .from('app_settings')
      .select('value')
      .eq('key', `MIN_${prefix}_USD`)
      .single();
    const { data: maxSetting } = await this.supabase
      .from('app_settings')
      .select('value')
      .eq('key', `MAX_${prefix}_USD`)
      .single();

    const min = parseFloat(minSetting?.value ?? '0');
    const max = parseFloat(maxSetting?.value ?? '999999');

    if (amount < min) {
      throw new BadRequestException(
        `El monto mínimo es $${min}`,
      );
    }
    if (amount > max) {
      throw new BadRequestException(
        `El monto máximo es $${max}`,
      );
    }
  }

  private async getUserWallet(userId: string, walletId?: string) {
    const query = this.supabase
      .from('wallets')
      .select('id, currency, network, address, provider_wallet_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (walletId) {
      query.eq('id', walletId);
    }

    const { data, error } = await query.limit(1).single();

    if (error || !data) {
      throw new NotFoundException('Wallet no encontrada para este usuario');
    }
    return data;
  }

  // ═══════════════════════════════════════════════
  //  INTERBANK ORDERS (CATEGORY: interbank)
  // ═══════════════════════════════════════════════

  async createInterbankOrder(userId: string, dto: CreateInterbankOrderDto) {
    await this.validateRateLimit(userId);
    await this.validateAmountLimits(dto.amount, 'interbank');

    switch (dto.flow_type) {
      case InterbankFlowType.BOLIVIA_TO_WORLD:
        return this.createBoliviaToWorld(userId, dto);
      case InterbankFlowType.WALLET_TO_WALLET:
        return this.createWalletToWallet(userId, dto);
      case InterbankFlowType.BOLIVIA_TO_WALLET:
        return this.createBoliviaToWallet(userId, dto);
      case InterbankFlowType.WORLD_TO_BOLIVIA:
        return this.createWorldToBolivia(userId, dto);
      case InterbankFlowType.WORLD_TO_WALLET:
        return this.createWorldToWallet(userId, dto);
      default:
        throw new BadRequestException(`Flujo no soportado: ${dto.flow_type}`);
    }
  }

  /**
   * 1.1 Bolivia → Mundo (PSAV completo)
   * BOB → cuenta PSAV BO → PSAV convierte → envía a external_account destino
   */
  private async createBoliviaToWorld(
    userId: string,
    dto: CreateInterbankOrderDto,
  ) {
    // Validar external_account existe y pertenece al usuario
    const { data: extAccount, error: extErr } = await this.supabase
      .from('bridge_external_accounts')
      .select('*')
      .eq('id', dto.external_account_id)
      .eq('user_id', userId)
      .single();

    if (extErr || !extAccount) {
      throw new NotFoundException('Cuenta externa de destino no encontrada');
    }

    // Obtener el número completo del JSON bank_details en la tabla 'suppliers'
    const { data: supplier } = await this.supabase
      .from('suppliers')
      .select('bank_details')
      .eq('bridge_external_account_id', dto.external_account_id)
      .single();

    const fullAccountNumber = supplier?.bank_details?.account_number 
      ?? extAccount.account_last_4 
      ?? extAccount.iban 
      ?? extAccount.swift_bic;

    // Obtener cuenta PSAV para depósito en BOB
    const psavAccount = await this.psavService.getDepositAccount(
      'bank_bo',
      'BOB',
    );
    const depositInstructions =
      this.psavService.formatDepositInstructions(psavAccount);

    // Calcular fee
    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'interbank_bo_out',
      'psav',
      dto.amount,
    );

    // Obtener tipo de cambio estimado
    const rateData = await this.exchangeRatesService.getRate('BOB_USD');

    // Crear orden
    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        flow_type: 'bolivia_to_world',
        flow_category: 'interbank',
        requires_psav: true,
        amount: dto.amount,
        currency: 'BOB',
        fee_amount,
        net_amount,
        destination_type: 'external_account',
        destination_currency: dto.destination_currency ?? extAccount.currency,
        external_account_id: dto.external_account_id,
        supplier_id: dto.supplier_id ?? null,
        destination_bank_name: extAccount.bank_name,
        destination_account_holder: extAccount.account_name ?? extAccount.first_name ?? extAccount.business_name,
        destination_account_number: fullAccountNumber,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount * rateData.effective_rate).toFixed(2),
        ),
        psav_deposit_instructions: depositInstructions,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📋 Orden bolivia_to_world creada: ${order.id} — $${dto.amount} BOB`,
    );
    return order;
  }

  /**
   * 1.2 Wallet → Wallet (Bridge Transfer, sin PSAV)
   * Crypto ad-hoc → Crypto ad-hoc vía Bridge Transfer API
   */
  private async createWalletToWallet(
    userId: string,
    dto: CreateInterbankOrderDto,
  ) {
    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'interbank_w2w',
      'bridge',
      dto.amount,
    );

    // Crear orden
    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        flow_type: 'wallet_to_wallet',
        flow_category: 'interbank',
        requires_psav: false,
        amount: dto.amount,
        currency: dto.source_currency?.toUpperCase() ?? 'USDT',
        fee_amount,
        net_amount,
        source_address: dto.source_address,
        source_network: dto.source_network,
        destination_type: 'crypto_address',
        destination_address: dto.destination_address,
        destination_network: dto.destination_network,
        destination_currency: dto.destination_currency?.toUpperCase() ?? dto.source_currency?.toUpperCase() ?? 'USDT',
        supplier_id: dto.supplier_id ?? null,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'created',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Ejecutar transfer vía Bridge API
    try {
      // Obtener bridge_customer_id del usuario (requerido por Bridge)
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('bridge_customer_id')
        .eq('id', userId)
        .single();

      if (!profile?.bridge_customer_id) {
        throw new Error(
          'El usuario no tiene bridge_customer_id asignado. Debe completar el KYC.',
        );
      }

      const idempotencyKey = `po_w2w_${order.id}`;
      const bridgeResult = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          on_behalf_of: profile.bridge_customer_id,
          source: {
            payment_rail: dto.source_network?.toLowerCase() ?? 'polygon',
            currency: dto.source_currency?.toLowerCase() ?? 'usdc',
            from_address: dto.source_address,
          },
          destination: {
            payment_rail: dto.destination_network?.toLowerCase() ?? 'polygon',
            currency: dto.destination_currency?.toLowerCase() ?? 'usdc',
            to_address: dto.destination_address,
          },
          amount: net_amount.toString(),
        },
        idempotencyKey,
      );

      const transferId = (bridgeResult?.id ?? null) as string | null;
      const sourceDepositInstructions = bridgeResult?.source_deposit_instructions ?? null;

      await this.supabase
        .from('payment_orders')
        .update({
          status: 'waiting_deposit',
          bridge_transfer_id: transferId,
          bridge_source_deposit_instructions: sourceDepositInstructions,
        })
        .eq('id', order.id);

      order.status = 'waiting_deposit';
      order.bridge_transfer_id = transferId;
      order.bridge_source_deposit_instructions = sourceDepositInstructions;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'failed',
          failure_reason: `Bridge Transfer falló: ${message}`,
        })
        .eq('id', order.id);

      throw new BadRequestException(
        `Error al ejecutar transfer: ${message}`,
      );
    }

    this.logger.log(
      `📋 Orden wallet_to_wallet creada: ${order.id} — ${dto.amount} ${dto.source_currency}`,
    );
    return order;
  }

  /**
   * 1.3 Bolivia → Wallet (PSAV a crypto externa)
   * BOB → cuenta PSAV BO → PSAV compra crypto → envía a wallet externa
   */
  private async createBoliviaToWallet(
    userId: string,
    dto: CreateInterbankOrderDto,
  ) {
    const psavAccount = await this.psavService.getDepositAccount(
      'bank_bo',
      'BOB',
    );
    const depositInstructions =
      this.psavService.formatDepositInstructions(psavAccount);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'interbank_bo_wallet',
      'psav',
      dto.amount,
    );

    const rateData = await this.exchangeRatesService.getRate('BOB_USDC');

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        flow_type: 'bolivia_to_wallet',
        flow_category: 'interbank',
        requires_psav: true,
        amount: dto.amount,
        currency: 'BOB',
        fee_amount,
        net_amount,
        destination_type: 'crypto_address',
        destination_address: dto.destination_address,
        destination_network: dto.destination_network,
        destination_currency: dto.destination_currency?.toUpperCase() ?? 'USDC',
        supplier_id: dto.supplier_id ?? null,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount * rateData.effective_rate).toFixed(2),
        ),
        psav_deposit_instructions: depositInstructions,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📋 Orden bolivia_to_wallet creada: ${order.id} — $${dto.amount} BOB`,
    );
    return order;
  }

  /**
   * 1.4 Mundo → Bolivia (Fiat/Crypto externo → cuenta bancaria BO)
   * El cliente envía dinero a Bridge VA o PSAV, luego se deposita en su cuenta bancaria BO
   */
  private async createWorldToBolivia(
    userId: string,
    dto: CreateInterbankOrderDto,
  ) {
    // Obtener cuenta PSAV para depósito en USD (el usuario deposita USD)
    const psavAccount = await this.psavService.getDepositAccount(
      'bank_us',
      'USD',
    );
    const depositInstructions =
      this.psavService.formatDepositInstructions(psavAccount);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'interbank_bo_in',
      'psav',
      dto.amount,
    );

    const rateData = await this.exchangeRatesService.getRate('USD_BOB');

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        flow_type: 'world_to_bolivia',
        flow_category: 'interbank',
        requires_psav: true,
        amount: dto.amount,
        currency: dto.destination_currency?.toUpperCase() ?? 'USD',
        fee_amount,
        net_amount,
        destination_type: 'bank_bo',
        destination_currency: 'BOB',
        destination_bank_name: dto.destination_bank_name,
        destination_account_number: dto.destination_account_number,
        destination_account_holder: dto.destination_account_holder,
        destination_qr_url: dto.destination_qr_url,
        supplier_id: dto.supplier_id ?? null,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount * rateData.effective_rate).toFixed(2),
        ),
        psav_deposit_instructions: depositInstructions,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📋 Orden world_to_bolivia creada: ${order.id} — $${dto.amount} USD→BOB`,
    );
    return order;
  }

  /**
   * 1.5 Mundo → Wallet (Wire/ACH/SEPA → Wallet Bridge)
   * El cliente envía fiat por Virtual Account → fondea el wallet Bridge
   */
  private async createWorldToWallet(
    userId: string,
    dto: CreateInterbankOrderDto,
  ) {
    // Verificar o Inferir VA
    let vaId = dto.virtual_account_id;
    if (!vaId) {
      const { data: va } = await this.supabase
        .from('bridge_virtual_accounts')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      if (!va) {
        throw new NotFoundException('Virtual Account no encontrada para el usuario');
      }
      vaId = va.id;
    } else {
      const { data: va } = await this.supabase
        .from('bridge_virtual_accounts')
        .select('id, bridge_virtual_account_id')
        .eq('id', vaId)
        .eq('user_id', userId)
        .single();

      if (!va)
        throw new NotFoundException('Virtual Account provista no encontrada');
    }

    const wallet = await this.getUserWallet(userId);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_on_fiat_us',
      'bridge',
      dto.amount,
    );

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'world_to_wallet',
        flow_category: 'interbank',
        requires_psav: false,
        amount: dto.amount,
        currency: 'USD',
        fee_amount,
        net_amount,
        destination_type: 'bridge_wallet',
        destination_currency: wallet.currency,
        supplier_id: dto.supplier_id ?? null,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📋 Orden world_to_wallet creada: ${order.id} — $${dto.amount} USD`,
    );
    return order;
  }

  // ═══════════════════════════════════════════════
  //  WALLET RAMP ORDERS (CATEGORY: wallet_ramp)
  // ═══════════════════════════════════════════════

  async createWalletRampOrder(userId: string, dto: CreateWalletRampOrderDto) {
    await this.validateRateLimit(userId);
    await this.validateAmountLimits(dto.amount, 'wallet_ramp');

    switch (dto.flow_type) {
      case WalletRampFlowType.FIAT_BO_TO_BRIDGE_WALLET:
        return this.createFiatBoToBridgeWallet(userId, dto);
      case WalletRampFlowType.CRYPTO_TO_BRIDGE_WALLET:
        return this.createCryptoToBridgeWallet(userId, dto);
      case WalletRampFlowType.FIAT_US_TO_BRIDGE_WALLET:
        return this.createFiatUsToBridgeWallet(userId, dto);
      case WalletRampFlowType.BRIDGE_WALLET_TO_FIAT_BO:
        return this.createBridgeWalletToFiatBo(userId, dto);
      case WalletRampFlowType.BRIDGE_WALLET_TO_CRYPTO:
        return this.createBridgeWalletToCrypto(userId, dto);
      case WalletRampFlowType.BRIDGE_WALLET_TO_FIAT_US:
        return this.createBridgeWalletToFiatUs(userId, dto);
      default:
        throw new BadRequestException(`Flujo no soportado: ${dto.flow_type}`);
    }
  }

  /**
   * 2.1 Fiat BO → Wallet Bridge (PSAV on-ramp)
   * BOB → PSAV → fondea wallet Bridge del usuario
   */
  private async createFiatBoToBridgeWallet(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    const wallet = await this.getUserWallet(userId, dto.wallet_id);

    const psavAccount = await this.psavService.getDepositAccount(
      'bank_bo',
      'BOB',
    );
    const depositInstructions =
      this.psavService.formatDepositInstructions(psavAccount);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_on_bo',
      'psav',
      dto.amount,
    );

    const rateData = await this.exchangeRatesService.getRate('BOB_USDC');

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'fiat_bo_to_bridge_wallet',
        flow_category: 'wallet_ramp',
        requires_psav: true,
        amount: dto.amount,
        currency: 'BOB',
        fee_amount,
        net_amount,
        destination_type: 'bridge_wallet',
        destination_currency: wallet.currency,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount * rateData.effective_rate).toFixed(2),
        ),
        psav_deposit_instructions: depositInstructions,
        notes: dto.notes,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📋 Orden fiat_bo_to_bridge_wallet: ${order.id} — ${dto.amount} BOB`,
    );
    return order;
  }

  /**
   * 2.2 Crypto → Wallet Bridge (Liquidation Address)
   * Crypto externo → Bridge liquidation address → wallet Bridge
   */
  private async createCryptoToBridgeWallet(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    const wallet = await this.getUserWallet(userId, dto.wallet_id);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_on_crypto',
      'bridge',
      dto.amount,
    );

    // Obtener instrucciones de depósito: la liquidation address del usuario
    let depositInstructions: Record<string, unknown> = {};
    const { data: liqAddr } = await this.supabase
      .from('bridge_liquidation_addresses')
      .select('bridge_liquidation_address_id, chain, address')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (liqAddr) {
      depositInstructions = {
        type: 'liquidation_address',
        address: liqAddr.address,
        chain: liqAddr.chain,
        label: `Liquidation Address (${liqAddr.chain})`,
      };
    }

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'crypto_to_bridge_wallet',
        flow_category: 'wallet_ramp',
        requires_psav: false,
        amount: dto.amount,
        currency: dto.source_address ? 'USDT' : wallet.currency,
        fee_amount,
        net_amount,
        source_address: dto.source_address,
        source_network: dto.source_network,
        destination_type: 'bridge_wallet',
        destination_currency: wallet.currency,
        bridge_source_deposit_instructions: depositInstructions,
        notes: dto.notes,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📋 Orden crypto_to_bridge_wallet: ${order.id} — ${dto.amount}`,
    );
    return order;
  }

  /**
   * 2.3 Fiat US → Wallet Bridge (Virtual Account)
   * Wire/ACH → Bridge Virtual Account → wallet Bridge
   */
  private async createFiatUsToBridgeWallet(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    const wallet = await this.getUserWallet(userId);

    // Obtener instrucciones del VA
    let depositInstructions: Record<string, unknown> = {};
    if (dto.virtual_account_id) {
      const { data: va } = await this.supabase
        .from('bridge_virtual_accounts')
        .select('*')
        .eq('id', dto.virtual_account_id)
        .eq('user_id', userId)
        .single();

      if (va) {
        depositInstructions = {
          type: 'virtual_account',
          account_name: va.account_name,
          account_number: va.account_number,
          routing_number: va.routing_number,
          bank_name: va.bank_name,
          source_currency: va.source_currency,
        };
      }
    }

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_on_fiat_us',
      'bridge',
      dto.amount,
    );

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'fiat_us_to_bridge_wallet',
        flow_category: 'wallet_ramp',
        requires_psav: false,
        amount: dto.amount,
        currency: 'USD',
        fee_amount,
        net_amount,
        destination_type: 'bridge_wallet',
        destination_currency: wallet.currency,
        bridge_source_deposit_instructions: depositInstructions,
        notes: dto.notes,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📋 Orden fiat_us_to_bridge_wallet: ${order.id} — $${dto.amount} USD`,
    );
    return order;
  }

  /**
   * 2.4 Wallet Bridge → Fiat BO (PSAV off-ramp)
   * Wallet Bridge → PSAV → cuenta bancaria BO del usuario
   */
  private async createBridgeWalletToFiatBo(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    const wallet = await this.getUserWallet(userId, dto.wallet_id);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_off_bo',
      'psav',
      dto.amount,
    );

    // Verificar saldo disponible
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_amount')
      .eq('user_id', userId)
      .eq('currency', wallet.currency)
      .single();

    const totalNeeded = dto.amount + fee_amount;
    if (
      !balance ||
      parseFloat(balance.available_amount ?? '0') < totalNeeded
    ) {
      throw new BadRequestException(
        `Saldo insuficiente. Necesitas $${totalNeeded} (monto + fee) pero tienes $${balance?.available_amount ?? 0}`,
      );
    }

    // Reservar saldo
    await this.supabase.rpc('reserve_balance', {
      p_user_id: userId,
      p_currency: wallet.currency,
      p_amount: totalNeeded,
    });

    const rateData = await this.exchangeRatesService.getRate('USDC_BOB');

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'bridge_wallet_to_fiat_bo',
        flow_category: 'wallet_ramp',
        requires_psav: true,
        amount: dto.amount,
        currency: wallet.currency,
        fee_amount,
        net_amount,
        destination_type: 'bank_bo',
        destination_currency: 'BOB',
        destination_bank_name: dto.destination_bank_name,
        destination_account_number: dto.destination_account_number,
        destination_account_holder: dto.destination_account_holder,
        destination_qr_url: dto.destination_qr_url,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount * rateData.effective_rate).toFixed(2),
        ),
        notes: dto.notes,
        status: 'processing',
      })
      .select()
      .single();

    if (error) {
      // Liberar reserva si falla la inserción
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: wallet.currency,
        p_amount: totalNeeded,
      });
      throw new BadRequestException(error.message);
    }

    this.logger.log(
      `📋 Orden bridge_wallet_to_fiat_bo: ${order.id} — ${dto.amount} ${wallet.currency}→BOB`,
    );
    return order;
  }

  /**
   * 2.5 Wallet Bridge → Crypto (Bridge Transfer)
   * Wallet Bridge → Bridge Transfer API → wallet crypto externo
   */
  private async createBridgeWalletToCrypto(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    const wallet = await this.getUserWallet(userId, dto.wallet_id);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_off_crypto',
      'bridge',
      dto.amount,
    );

    // Verificar saldo
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_amount')
      .eq('user_id', userId)
      .eq('currency', wallet.currency)
      .single();

    const totalNeeded = dto.amount + fee_amount;
    if (
      !balance ||
      parseFloat(balance.available_amount ?? '0') < totalNeeded
    ) {
      throw new BadRequestException(
        `Saldo insuficiente. Necesitas $${totalNeeded} pero tienes $${balance?.available_amount ?? 0}`,
      );
    }

    // Reservar saldo
    await this.supabase.rpc('reserve_balance', {
      p_user_id: userId,
      p_currency: wallet.currency,
      p_amount: totalNeeded,
    });

    // Crear orden
    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'bridge_wallet_to_crypto',
        flow_category: 'wallet_ramp',
        requires_psav: false,
        amount: dto.amount,
        currency: wallet.currency,
        fee_amount,
        net_amount,
        destination_type: 'crypto_address',
        destination_address: dto.destination_address,
        destination_network: dto.destination_network,
        destination_currency: dto.destination_currency ?? wallet.currency,
        notes: dto.notes,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: wallet.currency,
        p_amount: totalNeeded,
      });
      throw new BadRequestException(error.message);
    }

    // Ejecutar transfer vía Bridge API
    try {
      const idempotencyKey = `po_w2c_${order.id}`;
      const bridgeResult = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          source: {
            payment_rail: 'usdc',
            currency: wallet.currency.toLowerCase(),
            from_address: wallet.address,
          },
          destination: {
            payment_rail: (dto.destination_currency ?? wallet.currency).toLowerCase(),
            currency: (dto.destination_currency ?? wallet.currency).toLowerCase(),
            to_address: dto.destination_address,
          },
          amount: net_amount.toString(),
        },
        idempotencyKey,
      );

      const transferId = (bridgeResult?.id ?? null) as string | null;
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'processing',
          bridge_transfer_id: transferId,
        })
        .eq('id', order.id);

      // Crear ledger entry (pending, se liquida con webhook)
      await this.supabase.from('ledger_entries').insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount: totalNeeded,
        currency: wallet.currency,
        status: 'pending',
        reference_type: 'payment_order',
        reference_id: order.id,
        bridge_transfer_id: transferId,
        description: `Off-ramp crypto: ${net_amount} ${wallet.currency} → ${dto.destination_address}`,
      });

      order.status = 'processing';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Revertir
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: wallet.currency,
        p_amount: totalNeeded,
      });
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'failed',
          failure_reason: `Bridge Transfer falló: ${message}`,
        })
        .eq('id', order.id);

      throw new BadRequestException(
        `Error al ejecutar transfer crypto: ${message}`,
      );
    }

    this.logger.log(
      `📋 Orden bridge_wallet_to_crypto: ${order.id} — ${dto.amount} → ${dto.destination_address}`,
    );
    return order;
  }

  /**
   * 2.6 Wallet Bridge → Fiat US (Bridge Transfer a external_account)
   * Wallet Bridge → Bridge Transfer → cuenta bancaria US/SEPA/PIX
   */
  private async createBridgeWalletToFiatUs(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    const wallet = await this.getUserWallet(userId, dto.wallet_id);

    // Validar external_account
    const { data: extAccount } = await this.supabase
      .from('bridge_external_accounts')
      .select('id, account_type, currency, bridge_external_account_id')
      .eq('id', dto.external_account_id)
      .eq('user_id', userId)
      .single();

    if (!extAccount) {
      throw new NotFoundException('Cuenta externa no encontrada');
    }

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_off_fiat_us',
      'bridge',
      dto.amount,
    );

    // Verificar saldo
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_amount')
      .eq('user_id', userId)
      .eq('currency', wallet.currency)
      .single();

    const totalNeeded = dto.amount + fee_amount;
    if (
      !balance ||
      parseFloat(balance.available_amount ?? '0') < totalNeeded
    ) {
      throw new BadRequestException(
        `Saldo insuficiente. Necesitas $${totalNeeded} pero tienes $${balance?.available_amount ?? 0}`,
      );
    }

    // Reservar saldo
    await this.supabase.rpc('reserve_balance', {
      p_user_id: userId,
      p_currency: wallet.currency,
      p_amount: totalNeeded,
    });

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'bridge_wallet_to_fiat_us',
        flow_category: 'wallet_ramp',
        requires_psav: false,
        amount: dto.amount,
        currency: wallet.currency,
        fee_amount,
        net_amount,
        destination_type: 'external_account',
        destination_currency: extAccount.currency ?? 'USD',
        external_account_id: dto.external_account_id,
        notes: dto.notes,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: wallet.currency,
        p_amount: totalNeeded,
      });
      throw new BadRequestException(error.message);
    }

    // Ejecutar payout vía Bridge API usando external_account_id
    try {
      // Obtener bridge_customer_id del usuario
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('bridge_customer_id')
        .eq('id', userId)
        .single();

      const idempotencyKey = `po_w2f_${order.id}`;
      const bridgeResult = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          on_behalf_of: profile?.bridge_customer_id,
          source: {
            payment_rail: 'usdc',
            currency: wallet.currency.toLowerCase(),
            from_address: wallet.address,
          },
          destination: {
            payment_rail: extAccount.account_type ?? 'ach',
            currency: (extAccount.currency ?? 'usd').toLowerCase(),
            external_account_id: extAccount.bridge_external_account_id,
          },
          amount: net_amount.toString(),
        },
        idempotencyKey,
      );

      const transferId = (bridgeResult?.id ?? null) as string | null;
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'processing',
          bridge_transfer_id: transferId,
        })
        .eq('id', order.id);

      await this.supabase.from('ledger_entries').insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount: totalNeeded,
        currency: wallet.currency,
        status: 'pending',
        reference_type: 'payment_order',
        reference_id: order.id,
        bridge_transfer_id: transferId,
        description: `Off-ramp fiat US: $${net_amount} → cuenta bancaria`,
      });

      order.status = 'processing';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: wallet.currency,
        p_amount: totalNeeded,
      });
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'failed',
          failure_reason: `Bridge Payout falló: ${message}`,
        })
        .eq('id', order.id);

      throw new BadRequestException(
        `Error al ejecutar payout: ${message}`,
      );
    }

    this.logger.log(
      `📋 Orden bridge_wallet_to_fiat_us: ${order.id} — ${dto.amount} ${wallet.currency}→USD`,
    );
    return order;
  }

  // ═══════════════════════════════════════════════
  //  USER QUERIES & ACTIONS
  // ═══════════════════════════════════════════════

  /** Lista órdenes del usuario autenticado. */
  async getMyOrders(
    userId: string,
    filters?: {
      status?: string;
      flow_category?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 50);
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('payment_orders')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.flow_category)
      query = query.eq('flow_category', filters.flow_category);

    const { data, count, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  /** Detalle de una orden del usuario. */
  async getOrderById(userId: string, orderId: string) {
    const { data, error } = await this.supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Orden no encontrada');
    }

    return data;
  }

  /** El usuario confirma que realizó el depósito (sube comprobante). */
  async confirmDeposit(
    userId: string,
    orderId: string,
    dto: ConfirmDepositDto,
  ) {
    const { data: order, error: fetchErr } = await this.supabase
      .from('payment_orders')
      .select('id, user_id, status, requires_psav, notes')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !order) throw new NotFoundException('Orden no encontrada');

    if (order.status !== 'waiting_deposit') {
      throw new BadRequestException(
        `No se puede confirmar depósito en estado "${order.status}"`,
      );
    }

    const { data: updated, error } = await this.supabase
      .from('payment_orders')
      .update({
        status: 'deposit_received',
        deposit_proof_url: dto.deposit_proof_url,
        notes: dto.notes
          ? `${order.notes ?? ''}\n[USER] ${dto.notes}`.trim()
          : undefined,
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Notificar a admins que hay un depósito por revisar
    const { data: admins } = await this.supabase
      .from('profiles')
      .select('id')
      .in('role', ['staff', 'admin', 'super_admin'])
      .eq('is_active', true)
      .limit(5);

    if (admins?.length) {
      const notifications = admins.map((admin) => ({
        user_id: admin.id,
        type: 'system',
        title: 'Nuevo Depósito por Verificar',
        message: `Orden ${orderId} tiene comprobante de depósito pendiente de revisión`,
        reference_type: 'payment_order',
        reference_id: orderId,
      }));
      await this.supabase.from('notifications').insert(notifications);
    }

    return updated;
  }

  /** El usuario cancela su orden (solo si está en waiting_deposit). */
  async cancelOrder(userId: string, orderId: string) {
    const { data: order } = await this.supabase
      .from('payment_orders')
      .select('id, user_id, status, flow_type, amount, fee_amount, currency, wallet_id')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (!order) throw new NotFoundException('Orden no encontrada');

    const cancellableStatuses = ['created', 'waiting_deposit'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `No se puede cancelar una orden en estado "${order.status}"`,
      );
    }

    // Si tenía saldo reservado (flujos de salida), liberarlo
    const outboundFlows = [
      'bridge_wallet_to_crypto',
      'bridge_wallet_to_fiat_us',
      'bridge_wallet_to_fiat_bo',
    ];

    if (outboundFlows.includes(order.flow_type ?? '')) {
      const totalReserved =
        parseFloat(order.amount ?? '0') +
        parseFloat(order.fee_amount ?? '0');

      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: (order.currency ?? 'USDC').toUpperCase(),
        p_amount: totalReserved,
      });
    }

    const { data: updated, error } = await this.supabase
      .from('payment_orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return updated;
  }

  // ═══════════════════════════════════════════════
  //  ADMIN OPERATIONS
  // ═══════════════════════════════════════════════

  async listAllOrders(filters: {
    status?: string;
    flow_type?: string;
    flow_category?: string;
    requires_psav?: boolean;
    user_id?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('payment_orders')
      .select(
        `*`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.flow_type) query = query.eq('flow_type', filters.flow_type);
    if (filters.flow_category)
      query = query.eq('flow_category', filters.flow_category);
    if (filters.requires_psav !== undefined)
      query = query.eq('requires_psav', filters.requires_psav);
    if (filters.user_id) query = query.eq('user_id', filters.user_id);
    if (filters.from_date)
      query = query.gte('created_at', filters.from_date);
    if (filters.to_date) query = query.lte('created_at', filters.to_date);

    const { data, count, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async getOrderStats() {
    const { data: allActive } = await this.supabase
      .from('payment_orders')
      .select('status, requires_psav')
      .not('status', 'in', '("completed","failed","cancelled")');

    const rows = allActive ?? [];

    return {
      waiting_deposit: rows.filter((r) => r.status === 'waiting_deposit').length,
      deposit_received: rows.filter((r) => r.status === 'deposit_received').length,
      processing: rows.filter((r) => r.status === 'processing').length,
      sent: rows.filter((r) => r.status === 'sent').length,
      psav_pending: rows.filter(
        (r) =>
          r.requires_psav &&
          ['waiting_deposit', 'deposit_received'].includes(r.status),
      ).length,
    };
  }

  async approveOrder(
    orderId: string,
    actorId: string,
    dto: ApproveOrderDto,
  ) {
    const { data: order } = await this.supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'deposit_received') {
      throw new BadRequestException(
        `No se puede aprobar una orden en estado "${order.status}". Requerido: "deposit_received"`,
      );
    }
    if (!order.requires_psav) {
      throw new BadRequestException('Esta orden no requiere aprobación manual');
    }

    // Obtener tipo de cambio si no se proporcionó
    let exchangeRate = dto.exchange_rate_applied;
    if (!exchangeRate && order.flow_type) {
      const pairMap: Record<string, string> = {
        bolivia_to_world: 'BOB_USD',
        world_to_bolivia: 'USD_BOB',
        bolivia_to_wallet: 'BOB_USDC',
        fiat_bo_to_bridge_wallet: 'BOB_USDC',
        bridge_wallet_to_fiat_bo: 'USDC_BOB',
      };
      const pair = pairMap[order.flow_type];
      if (pair) {
        const rateData = await this.exchangeRatesService.getRate(pair);
        exchangeRate = rateData.effective_rate;
      }
    }

    const amountDestination = exchangeRate
      ? parseFloat(
          (parseFloat(order.net_amount ?? order.amount) * exchangeRate).toFixed(
            2,
          ),
        )
      : null;

    const { data: updated, error } = await this.supabase
      .from('payment_orders')
      .update({
        status: 'processing',
        approved_by: actorId,
        approved_at: new Date().toISOString(),
        exchange_rate_applied: exchangeRate,
        amount_destination: amountDestination,
        fee_amount: dto.fee_final ?? order.fee_amount,
        notes: dto.notes
          ? `${order.notes ?? ''}\n[ADMIN] ${dto.notes}`.trim()
          : order.notes,
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Audit log
    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      action: 'APPROVE_PAYMENT_ORDER',
      table_name: 'payment_orders',
      record_id: orderId,
      previous_values: { status: 'deposit_received' },
      new_values: {
        status: 'processing',
        exchange_rate_applied: exchangeRate,
        amount_destination: amountDestination,
      },
      source: 'admin_panel',
    });

    // Notificación al usuario
    await this.supabase.from('notifications').insert({
      user_id: order.user_id,
      type: 'financial',
      title: 'Orden Aprobada',
      message: `Tu orden de pago por ${order.amount} ${order.currency} ha sido aprobada y está siendo procesada.`,
      reference_type: 'payment_order',
      reference_id: orderId,
    });

    return updated;
  }

  async markSent(orderId: string, actorId: string, dto: MarkSentDto) {
    const { data: order } = await this.supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'processing') {
      throw new BadRequestException(
        `No se puede marcar como enviada una orden en estado "${order.status}"`,
      );
    }

    const { data: updated, error } = await this.supabase
      .from('payment_orders')
      .update({
        status: 'sent',
        tx_hash: dto.tx_hash,
        provider_reference: dto.provider_reference,
        notes: dto.notes
          ? `${order.notes ?? ''}\n[ADMIN] ${dto.notes}`.trim()
          : order.notes,
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      action: 'MARK_SENT_PAYMENT_ORDER',
      table_name: 'payment_orders',
      record_id: orderId,
      new_values: { status: 'sent', tx_hash: dto.tx_hash },
      source: 'admin_panel',
    });

    await this.supabase.from('notifications').insert({
      user_id: order.user_id,
      type: 'financial',
      title: 'Fondos Enviados',
      message: `Los fondos de tu orden han sido enviados. Referencia: ${dto.tx_hash}`,
      reference_type: 'payment_order',
      reference_id: orderId,
    });

    return updated;
  }

  async completeOrder(
    orderId: string,
    actorId: string,
    dto: CompleteOrderDto,
  ) {
    const { data: order } = await this.supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status !== 'sent') {
      throw new BadRequestException(
        `No se puede completar una orden en estado "${order.status}"`,
      );
    }

    const { data: updated, error } = await this.supabase
      .from('payment_orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        receipt_url: dto.receipt_url,
        notes: dto.notes
          ? `${order.notes ?? ''}\n[ADMIN] ${dto.notes}`.trim()
          : order.notes,
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Ledger entries para on-ramp a wallet Bridge (PSAV)
    if (order.flow_type === 'fiat_bo_to_bridge_wallet') {
      const netAmount = parseFloat(order.net_amount ?? order.amount);
      await this.supabase.from('ledger_entries').insert({
        wallet_id: order.wallet_id,
        type: 'credit',
        amount: netAmount,
        currency: order.destination_currency ?? order.currency,
        status: 'settled',
        reference_type: 'payment_order',
        reference_id: orderId,
        description: `On-ramp completado — ${netAmount} (PSAV)`,
      });
    }

    // Off-ramp PSAV a fiat BO — asentar débito y liberar reserva
    if (order.flow_type === 'bridge_wallet_to_fiat_bo') {
      const totalReserved =
        parseFloat(order.amount ?? '0') +
        parseFloat(order.fee_amount ?? '0');

      await this.supabase.from('ledger_entries').insert({
        wallet_id: order.wallet_id,
        type: 'debit',
        amount: totalReserved,
        currency: order.currency,
        status: 'settled',
        reference_type: 'payment_order',
        reference_id: orderId,
        description: `Off-ramp completado — ${order.amount} ${order.currency} → BOB (PSAV)`,
      });

      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: order.user_id,
        p_currency: (order.currency ?? 'USDC').toUpperCase(),
        p_amount: totalReserved,
      });
    }

    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      action: 'COMPLETE_PAYMENT_ORDER',
      table_name: 'payment_orders',
      record_id: orderId,
      new_values: { status: 'completed', receipt_url: dto.receipt_url },
      source: 'admin_panel',
    });

    await this.supabase.from('notifications').insert({
      user_id: order.user_id,
      type: 'financial',
      title: 'Orden Completada',
      message: `Tu orden de pago ha sido completada exitosamente.`,
      reference_type: 'payment_order',
      reference_id: orderId,
    });

    await this.supabase.from('activity_logs').insert({
      user_id: order.user_id,
      action: 'PAYMENT_ORDER_COMPLETED',
      description: `Orden ${orderId} (${order.flow_type}) completada por admin`,
    });

    return updated;
  }

  async failOrder(orderId: string, actorId: string, dto: FailOrderDto) {
    const { data: order } = await this.supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) throw new NotFoundException('Orden no encontrada');
    if (['completed', 'failed', 'cancelled'].includes(order.status)) {
      throw new BadRequestException(
        `No se puede fallar una orden en estado "${order.status}"`,
      );
    }

    const { data: updated, error } = await this.supabase
      .from('payment_orders')
      .update({
        status: 'failed',
        failure_reason: dto.reason,
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Liberar saldo reservado si aplica
    const outboundFlows = [
      'bridge_wallet_to_crypto',
      'bridge_wallet_to_fiat_us',
      'bridge_wallet_to_fiat_bo',
    ];

    if (outboundFlows.includes(order.flow_type ?? '')) {
      const totalReserved =
        parseFloat(order.amount ?? '0') +
        parseFloat(order.fee_amount ?? '0');

      await this.supabase
        .from('ledger_entries')
        .update({ status: 'failed' })
        .eq('reference_type', 'payment_order')
        .eq('reference_id', orderId)
        .eq('status', 'pending');

      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: order.user_id,
        p_currency: (order.currency ?? 'USDC').toUpperCase(),
        p_amount: totalReserved,
      });
    }

    await this.supabase.from('audit_logs').insert({
      performed_by: actorId,
      action: 'FAIL_PAYMENT_ORDER',
      table_name: 'payment_orders',
      record_id: orderId,
      new_values: { status: 'failed', failure_reason: dto.reason },
      source: 'admin_panel',
    });

    if (dto.notify_user !== false) {
      await this.supabase.from('notifications').insert({
        user_id: order.user_id,
        type: 'alert',
        title: 'Orden de Pago Fallida',
        message: `Tu orden de pago no pudo ser procesada. Motivo: ${dto.reason}`,
        reference_type: 'payment_order',
        reference_id: orderId,
      });
    }

    return updated;
  }
}
