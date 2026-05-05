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
import { ClientBankAccountsService } from '../client-bank-accounts/client-bank-accounts.service';
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
import { ALLOWED_NETWORKS } from '../../common/constants/guira-crypto-config.constants';
import {
  isValidBridgeRampRoute,
  isValidFiatBoDestination,
  getMinAmount,
  isValidOffRampRoute,
  getOffRampMinAmount,
  resolveFiatBoPsavMatch,
  resolvePsavCryptoSource,
  FIAT_BO_OFF_RAMP_SOURCE_CURRENCIES,
} from '../../common/constants/bridge-route-catalog.constants';
import {
  isValidTransferRoute,
  getTransferMinAmount,
} from '../../common/constants/transfer-route-catalog.constants';

@Injectable()
export class PaymentOrdersService {
  private readonly logger = new Logger(PaymentOrdersService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly feesService: FeesService,
    private readonly psavService: PsavService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly bridgeApi: BridgeApiClient,
    private readonly bankAccountsService: ClientBankAccountsService,
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
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

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
    currency?: string,
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

    // Normalizar el monto a USD para comparación justa.
    // BOB se convierte con el tipo de cambio actual.
    // Stablecoins (USDC, USDT, USDB, PYUSD, EURC) se tratan como ~1:1 USD.
    let amountUsd = amount;
    const upperCurrency = (currency ?? 'USD').toUpperCase();

    if (upperCurrency === 'BOB') {
      const rateData = await this.exchangeRatesService.getRate('BOB_USD');
      amountUsd = parseFloat((amount / rateData.effective_rate).toFixed(2));
    }
    // Para USD, USDC, USDT, USDB, PYUSD → amountUsd = amount (1:1)

    if (amountUsd < min) {
      throw new BadRequestException(
        `El monto mínimo es $${min} USD (tu monto equivale a ~$${amountUsd} USD)`,
      );
    }
    if (amountUsd > max) {
      throw new BadRequestException(
        `El monto máximo es $${max} USD (tu monto equivale a ~$${amountUsd} USD)`,
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

    // Resolver la moneda de entrada para normalizar límites a USD
    let inputCurrency = 'USD';
    switch (dto.flow_type) {
      case InterbankFlowType.BOLIVIA_TO_WORLD:
      case InterbankFlowType.BOLIVIA_TO_WALLET:
        inputCurrency = 'BOB';
        break;
      case InterbankFlowType.WALLET_TO_WALLET:
        inputCurrency = dto.source_currency?.toUpperCase() ?? 'USDC';
        break;
      // WORLD_TO_BOLIVIA, WORLD_TO_WALLET → USD (default)
    }

    await this.validateAmountLimits(dto.amount, 'interbank', inputCurrency);

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
    // y validar que el proveedor tenga una liquidation address configurada
    const { data: supplier } = await this.supabase
      .from('suppliers')
      .select('bank_details, bridge_liquidation_address_id')
      .eq('bridge_external_account_id', dto.external_account_id)
      .single();

    if (!supplier?.bridge_liquidation_address_id) {
      throw new BadRequestException(
        'El proveedor seleccionado no tiene una liquidation address configurada en Bridge. ' +
          'Contacte al administrador para configurarla antes de crear la orden.',
      );
    }

    const fullAccountNumber =
      supplier?.bank_details?.account_number ??
      extAccount.account_last_4 ??
      extAccount.iban ??
      extAccount.swift_bic;

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
        destination_account_holder:
          extAccount.account_name ??
          extAccount.first_name ??
          extAccount.business_name,
        destination_account_number: fullAccountNumber,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount / rateData.effective_rate).toFixed(2),
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
   * Crypto ad-hoc → Crypto del proveedor vía Bridge Transfer API.
   * El destino se resuelve desde el supplier seleccionado.
   */
  private async createWalletToWallet(
    userId: string,
    dto: CreateInterbankOrderDto,
  ) {
    // ── 1. Resolver destino desde el proveedor ──
    const { data: supplier, error: supplierErr } = await this.supabase
      .from('suppliers')
      .select('id, name, bank_details, payment_rail')
      .eq('id', dto.supplier_id)
      .eq('user_id', userId)
      .single();

    if (supplierErr || !supplier) {
      throw new NotFoundException(
        'Proveedor no encontrado o no pertenece al usuario.',
      );
    }

    const destAddress = supplier.bank_details?.wallet_address as
      | string
      | undefined;
    const destNetwork = supplier.bank_details?.wallet_network as
      | string
      | undefined;
    const destCurrency = (
      (supplier.bank_details?.wallet_currency as string | undefined) ??
      dto.destination_currency
    )?.toLowerCase();

    if (!destAddress || !destNetwork || !destCurrency) {
      throw new BadRequestException(
        'El proveedor seleccionado no tiene dirección, red o moneda crypto configurada. ' +
          'Complete los datos del proveedor antes de crear la orden.',
      );
    }

    // ── 2. Validar ruta Bridge (src_net/src_cur → dst_net/dst_cur) ──
    if (
      !isValidTransferRoute(
        dto.source_network!,
        dto.source_currency!,
        destNetwork,
        destCurrency,
      )
    ) {
      throw new BadRequestException(
        `La combinación de origen ${dto.source_currency?.toUpperCase()}/${dto.source_network} ` +
          `hacia ${destCurrency.toUpperCase()}/${destNetwork} no es soportada por Bridge. ` +
          `Selecciona una red y moneda de origen válidas para el destino del proveedor.`,
      );
    }

    // ── 3. Validar monto mínimo de la ruta ──
    const minAmount = getTransferMinAmount(
      dto.source_network!,
      dto.source_currency!,
      destNetwork,
      destCurrency,
    );
    if (dto.amount < minAmount) {
      throw new BadRequestException(
        `El monto mínimo para esta ruta (${dto.source_currency?.toUpperCase()}/${dto.source_network} → ` +
          `${destCurrency.toUpperCase()}/${destNetwork}) es ${minAmount} ${dto.source_currency?.toUpperCase()}.`,
      );
    }

    const feePercent = await this.feesService.getFeePercent(
      userId,
      'interbank_w2w',
      'bridge',
    );

    // fee_amount / net_amount para el registro local de la orden
    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'interbank_w2w',
      'bridge',
      dto.amount,
    );

    // ── 4. Crear orden ──
    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        flow_type: 'wallet_to_wallet',
        flow_category: 'interbank',
        requires_psav: false,
        amount: dto.amount,
        currency: dto.source_currency?.toUpperCase(),
        fee_amount,
        net_amount,
        source_address: dto.source_address,
        source_network: dto.source_network,
        destination_type: 'crypto_address',
        destination_address: destAddress,
        destination_network: destNetwork,
        destination_currency: destCurrency.toUpperCase(),
        exchange_rate_applied: 1,
        amount_destination: net_amount,
        supplier_id: dto.supplier_id,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'created',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // ── 5. Ejecutar transfer vía Bridge API ──
    try {
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
            payment_rail: dto.source_network?.toLowerCase(),
            currency: dto.source_currency?.toLowerCase(),
            // Sin from_address → Bridge acepta fondos de cualquier dirección
          },
          destination: {
            payment_rail: destNetwork.toLowerCase(),
            currency: destCurrency.toLowerCase(),
            to_address: destAddress,
          },
          // Sin amount → Bridge acepta cualquier monto (flexible_amount)
          developer_fee_percent: feePercent,
          features: {
            flexible_amount: true,
            allow_any_from_address: true,
          },
        },
        idempotencyKey,
      );

      const transferId = (bridgeResult?.id ?? null) as string | null;
      const sourceDepositInstructions =
        bridgeResult?.source_deposit_instructions ?? null;

      // ── Crear registro bridge_transfers (requerido para vincular webhooks) ──
      await this.supabase.from('bridge_transfers').insert({
        user_id: userId,
        bridge_transfer_id: transferId,
        amount: dto.amount,
        net_amount,
        bridge_state: (bridgeResult?.state as string) ?? 'awaiting_funds',
        status: 'pending',
        source_payment_rail: dto.source_network,
        destination_payment_rail: destNetwork,
        destination_currency: destCurrency.toUpperCase(),
        bridge_raw_response: bridgeResult,
      });

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

      throw new BadRequestException(`Error al ejecutar transfer: ${message}`);
    }

    this.logger.log(
      `📋 Orden wallet_to_wallet creada: ${order.id} — ${dto.amount} ${dto.source_currency} → ${destCurrency.toUpperCase()}/${destNetwork} (supplier: ${supplier.name})`,
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
    // Validar que el proveedor tenga liquidation address configurada
    const { data: supplier } = await this.supabase
      .from('suppliers')
      .select('bank_details, bridge_liquidation_address_id')
      .eq('id', dto.supplier_id)
      .single();

    if (!supplier?.bridge_liquidation_address_id) {
      throw new BadRequestException(
        'El proveedor seleccionado no tiene una liquidation address configurada en Bridge. ' +
          'Contacte al administrador para configurarla antes de crear la orden.',
      );
    }

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

    const rateData = await this.exchangeRatesService.getRate('BOB_USD');

    // Validar que se especificó el token destino (no asumimos USDC por defecto)
    if (!dto.destination_currency) {
      throw new BadRequestException(
        'destination_currency es obligatorio para bolivia_to_wallet. Especifica el token destino (ej: usdc, usdt).',
      );
    }

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
        destination_currency: dto.destination_currency.toUpperCase(),
        supplier_id: dto.supplier_id ?? null,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount / rateData.effective_rate).toFixed(2),
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
        currency: 'USD', // world_to_bolivia: el usuario deposita USD
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
    let vaData: any;
    if (!vaId) {
      const { data: va } = await this.supabase
        .from('bridge_virtual_accounts')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!va) {
        throw new NotFoundException(
          'Virtual Account no encontrada para el usuario',
        );
      }
      vaId = va.id;
      vaData = va;
    } else {
      const { data: va } = await this.supabase
        .from('bridge_virtual_accounts')
        .select('*')
        .eq('id', vaId)
        .eq('user_id', userId)
        .single();

      if (!va)
        throw new NotFoundException('Virtual Account provista no encontrada');
      vaData = va;
    }

    const wallet = await this.getUserWallet(userId);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_on_fiat_us',
      'bridge',
      dto.amount,
    );

    const depositInstructions = {
      type: 'bank',
      label: 'Tu Virtual Account',
      bank_name: vaData.bank_name || 'Banco de VA',
      account_holder:
        vaData.account_holder_name || vaData.beneficiary_name || 'Guira',
      account_number: `ACC: ${vaData.account_number || ''} | Routing: ${vaData.routing_number || ''}`,
      currency: vaData.destination_currency || 'USD',
    };

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
        psav_deposit_instructions: depositInstructions,
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

    // Resolver la moneda de entrada para normalizar límites a USD
    let inputCurrency = 'USD';
    switch (dto.flow_type) {
      case WalletRampFlowType.FIAT_BO_TO_BRIDGE_WALLET:
        inputCurrency = 'BOB';
        break;
      case WalletRampFlowType.CRYPTO_TO_BRIDGE_WALLET:
      case WalletRampFlowType.BRIDGE_WALLET_TO_FIAT_BO:
      case WalletRampFlowType.BRIDGE_WALLET_TO_CRYPTO:
      case WalletRampFlowType.BRIDGE_WALLET_TO_FIAT_US:
      case WalletRampFlowType.WALLET_TO_FIAT:
        inputCurrency = dto.source_currency?.toUpperCase() ?? 'USDC';
        break;
      // FIAT_US_TO_BRIDGE_WALLET → USD (default)
    }

    await this.validateAmountLimits(dto.amount, 'wallet_ramp', inputCurrency);

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
      case WalletRampFlowType.WALLET_TO_FIAT:
        return this.createWalletToFiat(userId, dto);
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

    const resolvedFiatBoDest = (
      dto.destination_currency ?? wallet.currency
    ).toLowerCase();
    if (!isValidFiatBoDestination(resolvedFiatBoDest)) {
      throw new BadRequestException(
        `El token ${resolvedFiatBoDest.toUpperCase()} no está soportado para fondeo con BOB. Tokens permitidos: USDC, USDT, USDB, PYUSD, EURC.`,
      );
    }

    // ── Validar bridge_customer_id (requerido por Bridge API) ──
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('bridge_customer_id')
      .eq('id', userId)
      .single();

    if (!profile?.bridge_customer_id) {
      throw new BadRequestException(
        'El usuario no tiene un bridge_customer_id configurado. Por favor, completa el registro.',
      );
    }

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

    const rateData = await this.exchangeRatesService.getRate('BOB_USD');

    // ── Resolver fuente del PSAV según token destino ──
    const psavSource = resolvePsavCryptoSource(resolvedFiatBoDest);

    // ── Convertir montos BOB → USDC (estimado interno, no se envía a Bridge) ──
    // Con flexible_amount Bridge acepta cualquier monto; usamos el estimado solo para
    // el registro interno (bridge_transfers, ledger_entry pendiente, amount_destination).
    const bridgeAmountEstimated = (
      dto.amount / rateData.effective_rate
    ).toFixed(2);
    const netAmountUsdc = parseFloat(
      (net_amount / rateData.effective_rate).toFixed(2),
    );

    // ── developer_fee_percent: fee BOB / amount BOB * 100 (el tipo de cambio se cancela) ──
    const developerFeePercent =
      dto.amount > 0 ? ((fee_amount / dto.amount) * 100).toFixed(4) : '0.0000';

    // ── Pre-generar orderId como idempotency key ──
    const orderId = crypto.randomUUID();
    const idempotencyKey = `po_fiat_bo_${orderId}`;

    // ── Llamada a Bridge Transfer API ──
    let bridgeTransfer: Record<string, unknown>;
    try {
      bridgeTransfer = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          on_behalf_of: profile.bridge_customer_id,
          source: psavSource,
          destination: {
            payment_rail: wallet.network,
            currency: resolvedFiatBoDest,
            bridge_wallet_id: wallet.provider_wallet_id,
          },
          developer_fee_percent: developerFeePercent,
          client_reference_id: orderId,
          features: {
            flexible_amount: true,
            allow_any_from_address: true,
          },
        },
        idempotencyKey,
      );
    } catch (err: any) {
      this.logger.error('Error llamando a Bridge Transfer API (fiat_bo):', err);
      const bridgeError =
        err?.response?.data?.message || err?.message || 'Error desconocido';
      throw new BadRequestException(
        'No se pudieron generar las instrucciones de depósito en Bridge. Razón: ' +
          bridgeError,
      );
    }

    // ── Extraer dirección de liquidación para el PSAV ──
    const bridgeInstr = bridgeTransfer.source_deposit_instructions as
      | Record<string, string>
      | undefined;
    const bridgeDepositInstructions = {
      type: 'liquidation_address',
      to_address: bridgeInstr?.to_address ?? '',
      payment_rail: psavSource.payment_rail,
      currency: psavSource.currency,
      label: `PSAV deposita ${psavSource.currency.toUpperCase()} en ${psavSource.payment_rail}`,
    };

    // ── Registrar en bridge_transfers ──
    const { data: bridgeTransferRow } = await this.supabase
      .from('bridge_transfers')
      .insert({
        user_id: userId,
        bridge_transfer_id: bridgeTransfer.id as string,
        amount: parseFloat(bridgeAmountEstimated),
        net_amount: netAmountUsdc,
        bridge_state: (bridgeTransfer.state as string) ?? 'awaiting_funds',
        status: 'pending',
        source_payment_rail: psavSource.payment_rail,
        destination_payment_rail: wallet.network,
        destination_currency: resolvedFiatBoDest.toUpperCase(),
        bridge_raw_response: bridgeTransfer,
      })
      .select('id')
      .single();

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        id: orderId,
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'fiat_bo_to_bridge_wallet',
        flow_category: 'wallet_ramp',
        requires_psav: true,
        amount: dto.amount,
        currency: 'BOB',
        fee_amount,
        net_amount,
        source_type: 'psav_bo',
        source_network: psavSource.payment_rail,
        source_currency: psavSource.currency.toUpperCase(),
        destination_type: 'bridge_wallet',
        destination_currency: resolvedFiatBoDest.toUpperCase(),
        bridge_transfer_id: bridgeTransfer.id as string,
        bridge_source_deposit_instructions: bridgeDepositInstructions,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: netAmountUsdc,
        psav_deposit_instructions: depositInstructions,
        notes: dto.notes,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // ── Ledger entry pendiente — se liquida con webhook ──
    await this.supabase.from('ledger_entries').insert({
      wallet_id: wallet.id,
      type: 'credit',
      amount: netAmountUsdc,
      currency: resolvedFiatBoDest.toUpperCase(),
      status: 'pending',
      reference_type: 'payment_order',
      reference_id: orderId,
      bridge_transfer_id: bridgeTransferRow?.id ?? null,
      description: `On-ramp BOB: ${dto.amount} BOB → ${netAmountUsdc} ${resolvedFiatBoDest.toUpperCase()} vía PSAV (${psavSource.payment_rail})`,
    });

    this.logger.log(
      `📋 Orden fiat_bo_to_bridge_wallet: ${orderId} — ${dto.amount} BOB → ${netAmountUsdc} ${resolvedFiatBoDest.toUpperCase()} | Bridge transfer: ${bridgeTransfer.id}`,
    );
    return order;
  }

  /**
   * 2.2 Crypto → Wallet Bridge (Depósito directo vía bridge_wallet_id)
   * Crypto externo → Bridge (allow_any_from_address) → wallet Bridge
   */
  private async createCryptoToBridgeWallet(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    const wallet = await this.getUserWallet(userId, dto.wallet_id);

    const [{ fee_amount, net_amount }, feePercent] = await Promise.all([
      this.feesService.calculateFee(
        userId,
        'ramp_on_crypto',
        'bridge',
        dto.amount ?? 0,
      ),
      this.feesService.getFeePercent(userId, 'ramp_on_crypto', 'bridge'),
    ]);

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('bridge_customer_id')
      .eq('id', userId)
      .single();

    if (!profile?.bridge_customer_id) {
      throw new BadRequestException(
        'El usuario no tiene un bridge_customer_id configurado. Por favor, completa el registro.',
      );
    }
    // ── Resolver moneda destino explícita (ya no se hereda de wallet.currency) ──
    const resolvedDestCurrency = (
      dto.destination_currency ?? wallet.currency
    ).toLowerCase();
    const resolvedSourceCurrency = (
      dto.source_currency ?? 'usdc'
    ).toLowerCase();
    const resolvedSourceNetwork = dto.source_network ?? wallet.network;

    if (!resolvedSourceNetwork) {
      throw new BadRequestException(
        'Debe especificar la red de origen (source_network).',
      );
    }

    // ── Validar compatibilidad de ruta contra catálogo Bridge ──
    if (
      !isValidBridgeRampRoute(
        resolvedSourceNetwork,
        resolvedSourceCurrency,
        resolvedDestCurrency,
      )
    ) {
      throw new BadRequestException(
        `La combinación ${resolvedSourceNetwork}/${resolvedSourceCurrency} → ${resolvedDestCurrency} no es soportada por Bridge.`,
      );
    }

    // ── Validar monto mínimo según catálogo Bridge (solo si se envía monto) ──
    const minAmount = getMinAmount(
      resolvedSourceNetwork,
      resolvedSourceCurrency,
    );
    if ((dto.amount ?? 0) > 0 && dto.amount < minAmount) {
      throw new BadRequestException(
        `El monto mínimo para ${resolvedSourceCurrency.toUpperCase()} en ${resolvedSourceNetwork} es ${minAmount}.`,
      );
    }

    // 1. Llamada a Bridge Transfer API
    // Pre-generar UUID para la orden — se reutiliza como idempotency key
    // para que retries contra Bridge no dupliquen el transfer.
    const orderId = crypto.randomUUID();
    let bridgeTransfer: Record<string, unknown>;
    const idempotencyKey = `po_c2bw_${orderId}`;
    try {
      bridgeTransfer = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          on_behalf_of: profile.bridge_customer_id,
          source: {
            payment_rail: dto.source_network,
            currency: resolvedSourceCurrency,
          },
          destination: {
            payment_rail: wallet.network,
            currency: resolvedDestCurrency,
            bridge_wallet_id: wallet.provider_wallet_id,
          },
          developer_fee_percent: feePercent,
          features: {
            allow_any_from_address: true,
            flexible_amount: true,
          },
        },
        idempotencyKey,
      );
    } catch (err: any) {
      this.logger.error('Error llamando a Bridge Transfer API:', err);
      const bridgeError =
        err?.response?.data?.message || err?.message || 'Error desconocido';
      throw new BadRequestException(
        'No se pudieron generar las instrucciones de depósito en Bridge. Razón: ' +
          bridgeError,
      );
    }

    // 2. Extraer instrucciones de depósito
    const bridgeInstr = bridgeTransfer.source_deposit_instructions as
      | Record<string, string>
      | undefined;
    const depositInstructions = {
      type: 'liquidation_address',
      address: bridgeInstr?.to_address ?? bridgeInstr?.address ?? '',
      chain:
        bridgeInstr?.payment_rail ?? bridgeInstr?.chain ?? dto.source_network,
      label: `Transferencia Bridge (${dto.source_network})`,
    };

    // 3. Crear registro de puente
    const { data: bridgeTransferRow } = await this.supabase
      .from('bridge_transfers')
      .insert({
        user_id: userId,
        bridge_transfer_id: bridgeTransfer.id as string,
        amount: dto.amount ?? 0,
        net_amount: net_amount,
        bridge_state: (bridgeTransfer.state as string) ?? 'payment_submitted',
        status: 'pending',
        source_payment_rail: dto.source_network,
        destination_payment_rail: wallet.network,
        destination_currency: resolvedDestCurrency.toUpperCase(),
        bridge_raw_response: bridgeTransfer,
      })
      .select('id')
      .single();

    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        id: orderId,
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'crypto_to_bridge_wallet',
        flow_category: 'wallet_ramp',
        requires_psav: false,
        amount: dto.amount ?? 0,
        currency: (dto.source_currency ?? wallet.currency).toUpperCase(),
        fee_amount,
        net_amount,
        source_type: 'crypto_external',
        source_currency: (dto.source_currency ?? 'usdc').toUpperCase(),
        source_address: dto.source_address ?? null,
        source_network: dto.source_network,
        destination_type: 'bridge_wallet',
        destination_currency: resolvedDestCurrency.toUpperCase(),
        bridge_transfer_id: bridgeTransfer.id as string,
        bridge_source_deposit_instructions: depositInstructions,
        notes:
          dto.notes ??
          `On-ramp crypto flexible: ${(dto.source_currency ?? 'usdc').toUpperCase()} (${dto.source_network}) → Bridge Wallet`,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        status: 'waiting_deposit',
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // 4. Crear ledger entry (credit, pending — se liquida con webhook)
    await this.supabase.from('ledger_entries').insert({
      wallet_id: wallet.id,
      type: 'credit',
      amount: net_amount,
      currency: resolvedDestCurrency.toUpperCase(),
      status: 'pending',
      reference_type: 'payment_order',
      reference_id: order.id,
      bridge_transfer_id: bridgeTransferRow?.id ?? null,
      description: `On-ramp crypto: ${net_amount} ${resolvedDestCurrency.toUpperCase()} desde ${dto.source_address ?? 'cualquier dirección'} (${dto.source_network})`,
    });

    this.logger.log(
      `📋 Orden crypto_to_bridge_wallet: ${order.id} — flexible_amount (fee_percent: ${feePercent}%)`,
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

    // Obtener y validar instrucciones del VA
    if (!dto.virtual_account_id) {
      throw new BadRequestException(
        'virtual_account_id es requerido para el flujo fiat_us_to_bridge_wallet',
      );
    }

    const { data: va, error: vaError } = await this.supabase
      .from('bridge_virtual_accounts')
      .select('*')
      .eq('id', dto.virtual_account_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (vaError || !va) {
      throw new BadRequestException(
        'Virtual Account no encontrada, inactiva o no pertenece al usuario',
      );
    }

    const depositInstructions: Record<string, unknown> = {
      type: 'virtual_account',
      label: `Cuenta bancaria VA (${va.source_currency?.toUpperCase() ?? 'USD'})`,
      account_name: va.account_name,
      beneficiary_name: va.beneficiary_name,
      account_number: va.account_number,
      routing_number: va.routing_number,
      bank_name: va.bank_name,
      source_currency: va.source_currency,
    };

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
   * 2.4 Wallet Bridge → Fiat BO (Bridge Transfer + PSAV off-ramp)
   *
   * Flujo de dos tramos:
   *   Tramo 1 (automático): Wallet Bridge del usuario → POST /v0/transfers → Wallet Crypto del PSAV
   *   Tramo 2 (manual):     PSAV convierte USDC → BOB → deposita en cuenta BO del usuario
   *
   * El webhook transfer.complete asienta el ledger y libera la reserva (Tramo 1).
   * Staff completa la orden cuando el PSAV confirma el depósito BOB (Tramo 2).
   */
  private async createBridgeWalletToFiatBo(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    // 1. Obtener cuenta bancaria aprobada del perfil del cliente
    const bankAccount =
      await this.bankAccountsService.getApprovedAccountForWithdrawal(userId);

    const wallet = await this.getUserWallet(userId, dto.wallet_id);

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_off_bo',
      'psav',
      dto.amount,
    );

    const sourceCurrency = (
      dto.source_currency ?? wallet.currency
    ).toUpperCase();

    // Validar token y ruta PSAV antes de tocar el saldo — sin coste de rollback si falla
    if (
      !FIAT_BO_OFF_RAMP_SOURCE_CURRENCIES.includes(sourceCurrency.toLowerCase())
    ) {
      throw new BadRequestException(
        `El token ${sourceCurrency} no está habilitado para retiro a Bolivia en este momento.`,
      );
    }

    const activePsavAccounts = await this.psavService.getActiveCryptoAccounts();
    const psavMatch = resolveFiatBoPsavMatch(
      sourceCurrency,
      activePsavAccounts,
    );

    if (!psavMatch) {
      throw new BadRequestException(
        `No hay canal PSAV configurado compatible con ${sourceCurrency}. Contacta al administrador.`,
      );
    }

    const {
      psavAccount,
      destCurrency: psavDestCurrency,
      minAmount: routeMinAmount,
    } = psavMatch;

    if (!psavAccount.crypto_address) {
      throw new BadRequestException(
        `La cuenta PSAV para ${sourceCurrency} no tiene dirección crypto configurada. Contacta al administrador.`,
      );
    }

    if (dto.amount < routeMinAmount) {
      throw new BadRequestException(
        `El monto mínimo para retirar ${sourceCurrency.toUpperCase()} a Bolivia es ${routeMinAmount} ${sourceCurrency.toUpperCase()}.`,
      );
    }

    // Verificar saldo disponible del token específico seleccionado
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_amount')
      .eq('user_id', userId)
      .eq('currency', sourceCurrency)
      .single();

    const totalNeeded = dto.amount;
    if (!balance || parseFloat(balance.available_amount ?? '0') < totalNeeded) {
      throw new BadRequestException(
        `Saldo insuficiente. Necesitas $${totalNeeded} pero tienes $${balance?.available_amount ?? 0}`,
      );
    }

    // Reservar saldo
    await this.supabase.rpc('reserve_balance', {
      p_user_id: userId,
      p_currency: sourceCurrency,
      p_amount: totalNeeded,
    });

    const rateData = await this.exchangeRatesService.getRate('USD_BOB');

    // Snapshot: los datos bancarios se copian en la orden para trazabilidad histórica
    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        flow_type: 'bridge_wallet_to_fiat_bo',
        flow_category: 'wallet_ramp',
        requires_psav: true,
        amount: dto.amount,
        currency: sourceCurrency,
        source_currency: sourceCurrency,
        fee_amount,
        net_amount,
        destination_type: 'bank_bo',
        destination_currency: 'BOB',
        destination_bank_name: bankAccount.bank_name,
        destination_account_number: bankAccount.account_number,
        destination_account_holder: bankAccount.account_holder,
        client_bank_account_id: bankAccount.id,
        destination_qr_url: dto.destination_qr_url,
        exchange_rate_applied: rateData.effective_rate,
        amount_destination: parseFloat(
          (net_amount * rateData.effective_rate).toFixed(2),
        ),
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: sourceCurrency,
        p_amount: totalNeeded,
      });
      throw new BadRequestException(error.message);
    }

    // Ejecutar Tramo 1: Bridge Transfer → PSAV crypto wallet
    try {
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('bridge_customer_id')
        .eq('id', userId)
        .single();

      // Validar y normalizar la red del PSAV
      if (
        !psavAccount.crypto_network ||
        psavAccount.crypto_network.trim() === ''
      ) {
        throw new Error(
          `La cuenta PSAV para ${sourceCurrency} no tiene red crypto configurada. Contacta al administrador.`,
        );
      }
      const psavRail = psavAccount.crypto_network.toLowerCase().trim();
      if (!ALLOWED_NETWORKS.includes(psavRail)) {
        throw new Error(
          `Red PSAV inválida: "${psavAccount.crypto_network}" (normalizada: "${psavRail}"). Valores permitidos: ${ALLOWED_NETWORKS.join(', ')}`,
        );
      }

      const transferPayload = {
        on_behalf_of: profile?.bridge_customer_id,
        source: {
          payment_rail: 'bridge_wallet',
          currency: sourceCurrency.toLowerCase(),
          bridge_wallet_id: wallet.provider_wallet_id,
        },
        destination: {
          payment_rail: psavRail,
          currency: psavDestCurrency.toLowerCase(),
          to_address: psavAccount.crypto_address,
        },
        amount: dto.amount.toFixed(2),
        developer_fee: fee_amount.toFixed(2),
        client_reference_id: order.id,
      };

      this.logger.log(
        `🔍 Bridge Transfer payload (fiat_bo): ${JSON.stringify(transferPayload)}`,
      );

      const idempotencyKey = `po_w2fbo_${order.id}`;
      const bridgeResult = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        transferPayload,
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

      // Crear registro bridge_transfers para que el webhook pueda vincularlo
      const { data: btRow } = await this.supabase
        .from('bridge_transfers')
        .insert({
          user_id: userId,
          bridge_transfer_id: transferId,
          source_payment_rail: 'bridge_wallet',
          source_currency: sourceCurrency.toLowerCase(),
          destination_payment_rail: psavRail,
          destination_currency: psavDestCurrency.toLowerCase(),
          amount: dto.amount,
          developer_fee_amount: fee_amount,
          net_amount,
          status: 'pending',
          bridge_state: (bridgeResult?.state as string) ?? 'awaiting_funds',
          bridge_raw_response: bridgeResult,
        })
        .select('id')
        .single();

      // Crear ledger entry (debit, pending — se asienta con webhook transfer.complete)
      await this.supabase.from('ledger_entries').insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount: totalNeeded,
        currency: sourceCurrency,
        status: 'pending',
        reference_type: 'payment_order',
        reference_id: order.id,
        bridge_transfer_id: btRow?.id ?? null,
        description: `Off-ramp BO: ${net_amount} ${sourceCurrency} → BOB (PSAV)`,
      });

      order.status = 'processing';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Revertir: liberar reserva + marcar failed
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: sourceCurrency,
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
        `Error al ejecutar transfer BO: ${message}`,
      );
    }

    this.logger.log(
      `📋 Orden bridge_wallet_to_fiat_bo: ${order.id} — ${dto.amount} ${sourceCurrency}→BOB (Bridge Transfer → PSAV)`,
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

    // Verificar saldo del token específico
    const sourceCurrency = (
      dto.source_currency ?? wallet.currency
    ).toUpperCase();
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_amount')
      .eq('user_id', userId)
      .eq('currency', sourceCurrency)
      .single();

    const totalNeeded = dto.amount;
    if (!balance || parseFloat(balance.available_amount ?? '0') < totalNeeded) {
      throw new BadRequestException(
        `Saldo insuficiente. Necesitas $${totalNeeded} pero tienes $${balance?.available_amount ?? 0}`,
      );
    }

    // Reservar saldo
    await this.supabase.rpc('reserve_balance', {
      p_user_id: userId,
      p_currency: sourceCurrency,
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
        currency: sourceCurrency,
        fee_amount,
        net_amount,
        destination_type: 'crypto_address',
        destination_address: dto.destination_address,
        destination_network: dto.destination_network,
        destination_currency: dto.destination_currency ?? sourceCurrency,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        notes: dto.notes,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: sourceCurrency,
        p_amount: totalNeeded,
      });
      throw new BadRequestException(error.message);
    }

    // Ejecutar transfer vía Bridge API
    try {
      // Obtener bridge_customer_id del usuario
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('bridge_customer_id')
        .eq('id', userId)
        .single();

      // Validar y normalizar la red destino
      const destinationRail = (dto.destination_network ?? '')
        .toLowerCase()
        .trim();
      if (!ALLOWED_NETWORKS.includes(destinationRail as any)) {
        throw new Error(
          `Red destino inválida: "${dto.destination_network}" (normalizada: "${destinationRail}"). Valores permitidos: ${ALLOWED_NETWORKS.join(', ')}`,
        );
      }

      // Validar ruta off-ramp contra catálogo Bridge
      const destCurrency = (
        dto.destination_currency ?? sourceCurrency
      ).toLowerCase();
      if (
        !isValidOffRampRoute(
          sourceCurrency.toLowerCase(),
          destinationRail,
          destCurrency,
        )
      ) {
        throw new BadRequestException(
          `Ruta off-ramp no soportada: ${sourceCurrency} → ${destinationRail} → ${destCurrency.toUpperCase()}. Verifica las combinaciones válidas.`,
        );
      }

      // Validar monto mínimo según la ruta
      const routeMin = getOffRampMinAmount(
        sourceCurrency.toLowerCase(),
        destinationRail,
        destCurrency,
      );
      if (routeMin > 0 && dto.amount < routeMin) {
        throw new BadRequestException(
          `Monto mínimo para esta ruta es ${routeMin} ${sourceCurrency}. Ingresaste ${dto.amount}.`,
        );
      }

      const transferPayload = {
        on_behalf_of: profile?.bridge_customer_id,
        source: {
          payment_rail: 'bridge_wallet',
          currency: sourceCurrency.toLowerCase(),
          bridge_wallet_id: wallet.provider_wallet_id,
        },
        destination: {
          payment_rail: destinationRail,
          currency: (dto.destination_currency ?? sourceCurrency).toLowerCase(),
          to_address: dto.destination_address,
        },
        amount: dto.amount.toFixed(2),
        developer_fee: fee_amount.toFixed(2),
        client_reference_id: order.id,
      };

      this.logger.log(
        `🔍 Bridge Transfer payload (crypto): ${JSON.stringify(transferPayload)}`,
      );

      const idempotencyKey = `po_w2c_${order.id}`;
      const bridgeResult = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        transferPayload,
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

      // Crear registro bridge_transfers para que el webhook pueda vincularlo
      // (consistente con bridge_wallet_to_fiat_bo y bridge_wallet_to_fiat_us)
      const { data: btRow } = await this.supabase
        .from('bridge_transfers')
        .insert({
          user_id: userId,
          bridge_transfer_id: transferId,
          source_payment_rail: 'bridge_wallet',
          source_currency: sourceCurrency.toLowerCase(),
          destination_payment_rail: destinationRail,
          destination_currency: (
            dto.destination_currency ?? sourceCurrency
          ).toLowerCase(),
          amount: dto.amount,
          developer_fee_amount: fee_amount,
          net_amount,
          status: 'pending',
          bridge_state: (bridgeResult?.state as string) ?? 'awaiting_funds',
          bridge_raw_response: bridgeResult,
        })
        .select('id')
        .single();

      // Crear ledger entry (pending, se liquida con webhook)
      await this.supabase.from('ledger_entries').insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount: totalNeeded,
        currency: sourceCurrency,
        status: 'pending',
        reference_type: 'payment_order',
        reference_id: order.id,
        bridge_transfer_id: btRow?.id ?? null,
        description: `Off-ramp crypto: ${net_amount} ${sourceCurrency} → ${dto.destination_address}`,
      });

      order.status = 'processing';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Revertir
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: sourceCurrency,
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

    // 1. Validar proveedor: debe pertenecer al usuario y tener bridge_external_account_id
    if (!dto.supplier_id) {
      throw new BadRequestException(
        'Debes especificar un proveedor (supplier_id) para el flujo bridge_wallet_to_fiat_us',
      );
    }
    const { data: supplier } = await this.supabase
      .from('suppliers')
      .select('id, name, bridge_external_account_id')
      .eq('id', dto.supplier_id)
      .eq('user_id', userId)
      .single();

    if (!supplier || !supplier.bridge_external_account_id) {
      throw new NotFoundException(
        'Proveedor no encontrado o no tiene cuenta bancaria registrada en Bridge.',
      );
    }

    // 2. Cargar external_account del proveedor (sin filtrar por user_id — pertenece al proveedor)
    const { data: extAccount } = await this.supabase
      .from('bridge_external_accounts')
      .select(
        'id, account_type, currency, bridge_external_account_id, payment_rail',
      )
      .eq('id', supplier.bridge_external_account_id)
      .eq('is_active', true)
      .single();

    if (!extAccount || !extAccount.bridge_external_account_id) {
      throw new NotFoundException(
        'La cuenta bancaria del proveedor no está activa o no está registrada en Bridge.',
      );
    }

    // Validar bridge_customer_id antes de operar con saldo
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('bridge_customer_id')
      .eq('id', userId)
      .single();

    if (!profile?.bridge_customer_id) {
      throw new BadRequestException(
        'El usuario no tiene una cuenta Bridge activa. Completa el KYC antes de realizar retiros.',
      );
    }

    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'ramp_off_fiat_us',
      'bridge',
      dto.amount,
    );

    // Verificar saldo del token específico
    const sourceCurrency = (
      dto.source_currency ?? wallet.currency
    ).toUpperCase();
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_amount')
      .eq('user_id', userId)
      .eq('currency', sourceCurrency)
      .single();

    const totalNeeded = dto.amount;
    if (!balance || parseFloat(balance.available_amount ?? '0') < totalNeeded) {
      throw new BadRequestException(
        `Saldo insuficiente. Necesitas $${totalNeeded} pero tienes $${balance?.available_amount ?? 0}`,
      );
    }

    // Reservar saldo
    await this.supabase.rpc('reserve_balance', {
      p_user_id: userId,
      p_currency: sourceCurrency,
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
        source_type: 'bridge_wallet',
        source_currency: sourceCurrency,
        amount: dto.amount,
        currency: sourceCurrency,
        fee_amount,
        net_amount,
        destination_type: 'external_account',
        destination_currency: extAccount.currency ?? 'USD',
        external_account_id: extAccount.id,
        supplier_id: supplier.id,
        notes: dto.notes,
        business_purpose: dto.business_purpose,
        supporting_document_url: dto.supporting_document_url,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: sourceCurrency,
        p_amount: totalNeeded,
      });
      throw new BadRequestException(error.message);
    }

    // Ejecutar payout vía Bridge API usando external_account_id
    try {
      const idempotencyKey = `po_w2f_${order.id}`;
      const bridgeResult = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          on_behalf_of: profile.bridge_customer_id,
          source: {
            payment_rail: 'bridge_wallet',
            currency: sourceCurrency.toLowerCase(),
            bridge_wallet_id: wallet.provider_wallet_id,
          },
          destination: {
            payment_rail: extAccount.payment_rail ?? 'ach',
            currency: (extAccount.currency ?? 'usd').toLowerCase(),
            external_account_id: extAccount.bridge_external_account_id,
          },
          amount: dto.amount.toFixed(2),
          developer_fee: fee_amount.toFixed(2),
          client_reference_id: order.id,
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

      // Crear registro bridge_transfers para que el webhook pueda vincularlo
      // (consistente con bridge_wallet_to_fiat_bo y bridge_wallet_to_crypto)
      const { data: btRow } = await this.supabase
        .from('bridge_transfers')
        .insert({
          user_id: userId,
          bridge_transfer_id: transferId,
          source_payment_rail: 'bridge_wallet',
          source_currency: sourceCurrency.toLowerCase(),
          destination_payment_rail: extAccount.payment_rail ?? 'ach',
          destination_currency: (extAccount.currency ?? 'usd').toLowerCase(),
          amount: dto.amount,
          developer_fee_amount: fee_amount,
          net_amount,
          status: 'pending',
          bridge_state: (bridgeResult?.state as string) ?? 'awaiting_funds',
          bridge_raw_response: bridgeResult,
        })
        .select('id')
        .single();

      await this.supabase.from('ledger_entries').insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount: totalNeeded,
        currency: sourceCurrency,
        status: 'pending',
        reference_type: 'payment_order',
        reference_id: order.id,
        bridge_transfer_id: btRow?.id ?? null,
        description: `Off-ramp fiat US: $${net_amount} → cuenta bancaria`,
      });

      order.status = 'processing';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.supabase.rpc('release_reserved_balance', {
        p_user_id: userId,
        p_currency: sourceCurrency,
        p_amount: totalNeeded,
      });
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'failed',
          failure_reason: `Bridge Payout falló: ${message}`,
        })
        .eq('id', order.id);

      throw new BadRequestException(`Error al ejecutar payout: ${message}`);
    }

    this.logger.log(
      `📋 Orden bridge_wallet_to_fiat_us: ${order.id} — ${dto.amount} ${wallet.currency}→USD`,
    );
    return order;
  }

  /**
   * 2.7 Wallet On-Chain → Fiat (Bridge Transfer: on-chain crypto → external_account)
   * Solana/Ethereum/Tron/Polygon/Stellar USDC → Bridge convierte → cuenta bancaria del proveedor
   * El usuario envía desde su wallet externa, no desde su wallet custodiada en Bridge.
   */
  private async createWalletToFiat(
    userId: string,
    dto: CreateWalletRampOrderDto,
  ) {
    if (!dto.supplier_id) {
      throw new BadRequestException(
        'Debes especificar un proveedor (supplier_id) para el flujo wallet_to_fiat',
      );
    }
    if (!dto.source_address) {
      throw new BadRequestException(
        'Debes especificar la dirección de origen (source_address)',
      );
    }
    if (!dto.source_network) {
      throw new BadRequestException(
        'Debes especificar la red de origen (source_network)',
      );
    }
    if (!dto.business_purpose) {
      throw new BadRequestException(
        'El motivo del retiro (business_purpose) es obligatorio para este flujo',
      );
    }

    // 1. Validar proveedor: debe pertenecer al usuario y tener bridge_external_account_id
    const { data: supplier } = await this.supabase
      .from('suppliers')
      .select('id, name, bridge_external_account_id')
      .eq('id', dto.supplier_id)
      .eq('user_id', userId)
      .single();

    if (!supplier || !supplier.bridge_external_account_id) {
      throw new NotFoundException(
        'Proveedor no encontrado o no tiene cuenta bancaria registrada en Bridge.',
      );
    }

    // 2. Cargar datos de la external_account del proveedor en Bridge
    // FIX #1: No filtrar por user_id — la cuenta bancaria pertenece al PROVEEDOR (supplier),
    // no al usuario que realiza la transferencia. El supplier ya fue validado como del usuario.
    const { data: extAccount } = await this.supabase
      .from('bridge_external_accounts')
      .select('id, bridge_external_account_id, payment_rail, currency')
      .eq('id', supplier.bridge_external_account_id)
      .eq('is_active', true)
      .single();

    if (!extAccount || !extAccount.bridge_external_account_id) {
      throw new NotFoundException(
        'La cuenta bancaria del proveedor no está activa o no está registrada en Bridge.',
      );
    }

    // 3. Calcular fee
    const sourceCurrency = dto.source_currency?.toUpperCase() ?? 'USDC';
    const { fee_amount, net_amount } = await this.feesService.calculateFee(
      userId,
      'wallet_to_fiat_off', // tarifa dedicada para flujo on-chain → fiat (mayor developer fee que ramp_off_fiat_us)
      'bridge',
      dto.amount,
    );

    // 4. Obtener bridge_customer_id del usuario y wallet de referencia
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('bridge_customer_id')
      .eq('id', userId)
      .single();

    if (!profile?.bridge_customer_id) {
      throw new BadRequestException(
        'El usuario no tiene un customer de Bridge asociado.',
      );
    }

    // FIX #2: Resolver wallet de referencia del usuario para el asiento contable.
    // ledger_entries.wallet_id es NOT NULL — en flujos on-chain los fondos no vienen
    // de la wallet interna, pero necesitamos una referencia válida para la FK.
    const { data: refWallet } = await this.supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!refWallet) {
      throw new BadRequestException(
        'El usuario no tiene una wallet activa en Guira.',
      );
    }

    // 5. Crear payment_order (status: pending)
    const { data: order, error } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        flow_type: 'wallet_to_fiat',
        flow_category: 'wallet_ramp',
        requires_psav: false,
        source_type: 'on_chain_wallet',
        source_address: dto.source_address,
        source_network: dto.source_network,
        source_currency: sourceCurrency,
        amount: dto.amount,
        currency: sourceCurrency,
        fee_amount,
        net_amount,
        destination_type: 'external_account',
        destination_currency: (extAccount.currency ?? 'usd').toUpperCase(),
        supplier_id: supplier.id,
        external_account_id: extAccount.id,
        business_purpose: dto.business_purpose,
        notes: dto.notes,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(
        `Error al crear la orden de pago: ${error.message}`,
      );
    }

    // 6. Llamar a Bridge /v0/transfers
    try {
      const idempotencyKey = `wtf-${order.id}`;

      const bridgeResult = await this.bridgeApi.post<Record<string, unknown>>(
        '/v0/transfers',
        {
          on_behalf_of: profile.bridge_customer_id,
          source: {
            payment_rail: dto.source_network.toLowerCase(),
            currency: sourceCurrency.toLowerCase(),
            from_address: dto.source_address,
          },
          destination: {
            payment_rail: extAccount.payment_rail ?? 'ach',
            currency: (extAccount.currency ?? 'usd').toLowerCase(),
            external_account_id: extAccount.bridge_external_account_id,
          },
          amount: dto.amount.toString(),
          developer_fee: fee_amount.toString(),
          client_reference_id: order.id,
          return_instructions: {
            address: dto.source_address,
          },
        },
        idempotencyKey,
      );

      const transferId = (bridgeResult?.id ?? null) as string | null;

      // 7. Actualizar orden a processing
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'processing',
          bridge_transfer_id: transferId,
        })
        .eq('id', order.id);

      // 8. Registrar en bridge_transfers para seguimiento de webhooks
      const { data: btRow } = await this.supabase
        .from('bridge_transfers')
        .insert({
          user_id: userId,
          bridge_transfer_id: transferId,
          source_payment_rail: dto.source_network.toLowerCase(),
          source_currency: sourceCurrency.toLowerCase(),
          destination_payment_rail: extAccount.payment_rail ?? 'ach',
          destination_currency: (extAccount.currency ?? 'usd').toLowerCase(),
          amount: dto.amount,
          developer_fee_amount: fee_amount,
          net_amount,
          status: 'pending',
          bridge_state: (bridgeResult?.state as string) ?? 'awaiting_funds',
          bridge_raw_response: bridgeResult,
        })
        .select('id')
        .single();

      // 9. Ledger entry informativo — los fondos vienen on-chain, no del balance interno.
      // FIX #2: Usar refWallet.id como referencia FK (NOT NULL). El asiento es de tipo
      // 'debit' pendiente; se asentará a 'settled' cuando Bridge confirme el transfer.
      try {
        await this.supabase.from('ledger_entries').insert({
          wallet_id: refWallet.id, // wallet de referencia del usuario (no se debita)
          type: 'debit',
          amount: dto.amount,
          currency: sourceCurrency,
          status: 'pending',
          reference_type: 'payment_order',
          reference_id: order.id,
          bridge_transfer_id: btRow?.id ?? null,
          description: `Wallet-to-fiat (on-chain): ${dto.amount} ${sourceCurrency} (${dto.source_network}) → ${supplier.name}`,
        });
      } catch (ledgerErr) {
        // El ledger es informativo para este flujo (los fondos no son custodiados).
        // Un fallo aquí NO debe revertir la orden — Bridge ya aceptó el transfer.
        this.logger.warn(
          `⚠️ wallet_to_fiat ${order.id}: Error al crear ledger_entry (no bloqueante): ${ledgerErr instanceof Error ? ledgerErr.message : ledgerErr}`,
        );
      }

      order.status = 'processing';
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
        `Error al ejecutar wallet-to-fiat: ${message}`,
      );
    }

    this.logger.log(
      `📋 Orden wallet_to_fiat: ${order.id} — ${dto.amount} ${sourceCurrency} (${dto.source_network}) → ${supplier.name}`,
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

  /**
   * Devuelve TODAS las órdenes del usuario que coinciden con los filtros
   * (sin paginación). Uso exclusivo para exportación de reportes.
   */
  async getOrdersForExport(
    userId: string,
    filters?: { status?: string },
  ) {
    let query = this.supabase
      .from('payment_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
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

  /**
   * El usuario actualiza campos editables de su orden.
   * Solo permite campos seguros (supporting_document_url, notes)
   * y solo en estados tempranos (created, waiting_deposit).
   */
  async updateOrderByUser(
    userId: string,
    orderId: string,
    dto: Record<string, unknown>,
  ) {
    const EDITABLE_STATUSES = ['created', 'waiting_deposit'];
    const ALLOWED_FIELDS = ['supporting_document_url', 'notes'];

    const { data: order, error: fetchErr } = await this.supabase
      .from('payment_orders')
      .select('id, status')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !order) {
      throw new NotFoundException('Orden no encontrada');
    }

    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `No se puede modificar una orden en estado "${order.status}"`,
      );
    }

    // Filtrar a solo campos permitidos
    const safeUpdate: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in dto) {
        safeUpdate[key] = dto[key];
      }
    }

    if (Object.keys(safeUpdate).length === 0) {
      throw new BadRequestException(
        'No se proporcionaron campos válidos para actualizar',
      );
    }

    const { data, error } = await this.supabase
      .from('payment_orders')
      .update(safeUpdate)
      .eq('id', orderId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    this.logger.log(
      `📝 Orden ${orderId} actualizada por usuario: ${Object.keys(safeUpdate).join(', ')}`,
    );
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
      .select(
        'id, user_id, status, flow_type, amount, fee_amount, currency, wallet_id',
      )
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

    // 1. Manejar ledger entries 'pending' de esta orden
    const { data: pendingLedgers } = await this.supabase
      .from('ledger_entries')
      .update({ status: 'cancelled' })
      .eq('reference_type', 'payment_order')
      .eq('reference_id', orderId)
      .eq('status', 'pending')
      .select('amount, type');

    if (pendingLedgers && pendingLedgers.length > 0) {
      // Liberar saldos reservados asociados a debitos pendientes
      const totalToRelease = pendingLedgers
        .filter((l) => l.type === 'debit')
        .reduce((sum, l) => sum + parseFloat(l.amount), 0);

      if (totalToRelease > 0) {
        await this.supabase.rpc('release_reserved_balance', {
          p_user_id: userId,
          p_currency: (order.currency ?? 'USDC').toUpperCase(),
          p_amount: totalToRelease,
        });

        this.logger.log(
          `💰 Reserva liberada para orden cancelada: ${totalToRelease} ${order.currency}`,
        );
      }
    }

    // 2. Manejar ledgers 'settled' (es decir, el balance ya fue deducto definitivamente)
    // Para devoluciones en este punto, necesitamos emitir un reembolso (credit).
    const { data: settledLedgers } = await this.supabase
      .from('ledger_entries')
      .select('amount, type')
      .eq('reference_type', 'payment_order')
      .eq('reference_id', orderId)
      .eq('status', 'settled')
      .eq('type', 'debit');

    if (settledLedgers && settledLedgers.length > 0 && order.wallet_id) {
      const totalToRefund = settledLedgers.reduce(
        (sum, l) => sum + parseFloat(l.amount),
        0,
      );

      if (totalToRefund > 0) {
        await this.supabase.from('ledger_entries').insert({
          wallet_id: order.wallet_id,
          type: 'credit',
          amount: totalToRefund,
          currency: order.currency,
          status: 'settled',
          reference_type: 'payment_order',
          reference_id: orderId,
          description: `Reembolso por orden cancelada`,
        });

        this.logger.log(
          `💰 Reembolso emitido para orden cancelada: ${totalToRefund} ${order.currency}`,
        );
      }
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
      .select(`*`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.flow_type) query = query.eq('flow_type', filters.flow_type);
    if (filters.flow_category)
      query = query.eq('flow_category', filters.flow_category);
    if (filters.requires_psav !== undefined)
      query = query.eq('requires_psav', filters.requires_psav);
    if (filters.user_id) query = query.eq('user_id', filters.user_id);
    if (filters.from_date) query = query.gte('created_at', filters.from_date);
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
      waiting_deposit: rows.filter((r) => r.status === 'waiting_deposit')
        .length,
      deposit_received: rows.filter((r) => r.status === 'deposit_received')
        .length,
      processing: rows.filter((r) => r.status === 'processing').length,
      sent: rows.filter((r) => r.status === 'sent').length,
      psav_pending: rows.filter(
        (r) =>
          r.requires_psav &&
          ['waiting_deposit', 'deposit_received'].includes(r.status),
      ).length,
    };
  }

  async approveOrder(orderId: string, actorId: string, dto: ApproveOrderDto) {
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
        bolivia_to_wallet: 'BOB_USD',
        fiat_bo_to_bridge_wallet: 'BOB_USD',
      };
      const pair = pairMap[order.flow_type];
      if (pair) {
        const rateData = await this.exchangeRatesService.getRate(pair);
        exchangeRate = rateData.effective_rate;
      }
    }

    const isBobOut = [
      'bolivia_to_world',
      'bolivia_to_wallet',
      'fiat_bo_to_bridge_wallet',
    ].includes(order.flow_type ?? '');

    const amountDestination = exchangeRate
      ? parseFloat(
          (isBobOut
            ? parseFloat(order.net_amount ?? order.amount) / exchangeRate
            : parseFloat(order.net_amount ?? order.amount) * exchangeRate
          ).toFixed(2),
        )
      : null;

    // Monto bruto que el PSAV debe depositar en la liquidation address (sin descontar fee).
    // Bridge cobrará el fee como custom_developer_fee_percent configurado en la liquidation address,
    // así el cobro se realiza una sola vez y no hay doble descuento.
    const amountToDeposit =
      exchangeRate && isBobOut
        ? parseFloat(
            (parseFloat(order.amount) / exchangeRate).toFixed(2),
          )
        : amountDestination;

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

    // ── Bolivia-to-World: flujo asistido por staff via liquidation address ──
    // NO se crea Bridge Transfer automáticamente. El staff depositará USDC manualmente
    // en la liquidation address del proveedor y el webhook drain confirmará el expediente.
    if (order.flow_type === 'bolivia_to_world') {
      // 1. Cargar supplier y su bridge_liquidation_address_id
      if (!order.supplier_id) {
        throw new BadRequestException(
          'La orden bolivia_to_world no tiene supplier_id asignado. No se puede resolver la liquidation address.',
        );
      }

      const { data: supplier } = await this.supabase
        .from('suppliers')
        .select('id, name, bridge_liquidation_address_id')
        .eq('id', order.supplier_id)
        .single();

      if (!supplier?.bridge_liquidation_address_id) {
        throw new BadRequestException(
          `El proveedor "${supplier?.name ?? order.supplier_id}" no tiene liquidation address configurada en Bridge.`,
        );
      }

      // 2. Consultar bridge_liquidation_addresses para obtener datos de depósito
      const { data: liqAddr } = await this.supabase
        .from('bridge_liquidation_addresses')
        .select(
          'id, bridge_liquidation_address_id, chain, currency, address, destination_payment_rail, destination_currency, destination_external_account_id, destination_address',
        )
        .eq(
          'bridge_liquidation_address_id',
          supplier.bridge_liquidation_address_id,
        )
        .single();

      if (!liqAddr) {
        throw new BadRequestException(
          `Liquidation address "${supplier.bridge_liquidation_address_id}" no encontrada en la base de datos.`,
        );
      }

      // 3. Persistir datos de liquidation como instrucciones de depósito para el staff
      const liquidationInstructions = {
        type: 'liquidation_address',
        bridge_liquidation_address_id: liqAddr.bridge_liquidation_address_id,
        to_address: liqAddr.address,
        chain: liqAddr.chain,
        currency: liqAddr.currency,
        payment_rail: liqAddr.chain,
        destination_payment_rail: liqAddr.destination_payment_rail,
        destination_currency: liqAddr.destination_currency,
        destination_external_account_id:
          liqAddr.destination_external_account_id,
        destination_address: liqAddr.destination_address,
        supplier_name: supplier.name,
        amount_to_deposit: amountToDeposit,
      };

      await this.supabase
        .from('payment_orders')
        .update({
          bridge_source_deposit_instructions: liquidationInstructions,
        })
        .eq('id', orderId);

      // Propagar cambios al objeto que se retorna
      updated.bridge_source_deposit_instructions = liquidationInstructions;

      this.logger.log(
        `📋 Orden bolivia_to_world ${orderId} en processing — staff debe depositar ` +
          `${amountDestination ?? 'N/A'} ${liqAddr.currency} en liquidation address ${liqAddr.address} ` +
          `(chain: ${liqAddr.chain}, proveedor: ${supplier.name})`,
      );
    }

    // ── Bolivia-to-Wallet: flujo asistido por staff via liquidation address (crypto) ──
    // Mismo patrón que bolivia_to_world pero el matching del drain será por to_address
    if (order.flow_type === 'bolivia_to_wallet') {
      if (!order.supplier_id) {
        throw new BadRequestException(
          'La orden bolivia_to_wallet no tiene supplier_id asignado. No se puede resolver la liquidation address.',
        );
      }

      const { data: walletSupplier } = await this.supabase
        .from('suppliers')
        .select('id, name, bridge_liquidation_address_id')
        .eq('id', order.supplier_id)
        .single();

      if (!walletSupplier?.bridge_liquidation_address_id) {
        throw new BadRequestException(
          `El proveedor "${walletSupplier?.name ?? order.supplier_id}" no tiene liquidation address configurada en Bridge.`,
        );
      }

      const { data: walletLiqAddr } = await this.supabase
        .from('bridge_liquidation_addresses')
        .select(
          'id, bridge_liquidation_address_id, chain, currency, address, destination_payment_rail, destination_currency, destination_address',
        )
        .eq(
          'bridge_liquidation_address_id',
          walletSupplier.bridge_liquidation_address_id,
        )
        .single();

      if (!walletLiqAddr) {
        throw new BadRequestException(
          `Liquidation address "${walletSupplier.bridge_liquidation_address_id}" no encontrada en la base de datos.`,
        );
      }

      const walletLiquidationInstructions = {
        type: 'liquidation_address',
        bridge_liquidation_address_id:
          walletLiqAddr.bridge_liquidation_address_id,
        to_address: walletLiqAddr.address,
        chain: walletLiqAddr.chain,
        currency: walletLiqAddr.currency,
        payment_rail: walletLiqAddr.chain,
        destination_payment_rail: walletLiqAddr.destination_payment_rail,
        destination_currency: walletLiqAddr.destination_currency,
        destination_address: walletLiqAddr.destination_address,
        supplier_name: walletSupplier.name,
        amount_to_deposit: amountToDeposit,
      };

      await this.supabase
        .from('payment_orders')
        .update({
          bridge_source_deposit_instructions: walletLiquidationInstructions,
        })
        .eq('id', orderId);

      updated.bridge_source_deposit_instructions =
        walletLiquidationInstructions;

      this.logger.log(
        `📋 Orden bolivia_to_wallet ${orderId} en processing — staff debe depositar ` +
          `${amountToDeposit ?? 'N/A'} ${walletLiqAddr.currency} en liquidation address ${walletLiqAddr.address} ` +
          `(chain: ${walletLiqAddr.chain}, proveedor: ${walletSupplier.name})`,
      );
    }

    return updated;
  }

  async markSent(orderId: string, actorId: string, dto: MarkSentDto) {
    const { data: order } = await this.supabase
      .from('payment_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) throw new NotFoundException('Orden no encontrada');
    if (
      [
        'fiat_bo_to_bridge_wallet',
        'crypto_to_bridge_wallet',
        'bolivia_to_world',
        'bolivia_to_wallet',
      ].includes(order.flow_type ?? '')
    ) {
      throw new BadRequestException(
        'Este flujo se completa automáticamente por webhook de Bridge. markSent no está disponible.',
      );
    }
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

  async completeOrder(orderId: string, actorId: string, dto: CompleteOrderDto) {
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

    // Off-ramp PSAV a fiat BO — El ledger debit y la liberación de reserva
    // ahora se manejan automáticamente en el webhook transfer.complete (Tramo 1).
    // El completeOrder solo finaliza el estado de la orden tras el payout BOB (Tramo 2).

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

    // 1. Manejar ledger entries 'pending' de esta orden
    const { data: pendingLedgers } = await this.supabase
      .from('ledger_entries')
      .update({ status: 'failed' })
      .eq('reference_type', 'payment_order')
      .eq('reference_id', orderId)
      .eq('status', 'pending')
      .select('amount, type');

    if (pendingLedgers && pendingLedgers.length > 0) {
      // Liberar saldos reservados asociados a debitos pendientes
      const totalToRelease = pendingLedgers
        .filter((l) => l.type === 'debit')
        .reduce((sum, l) => sum + parseFloat(l.amount), 0);

      if (totalToRelease > 0) {
        await this.supabase.rpc('release_reserved_balance', {
          p_user_id: order.user_id,
          p_currency: (order.currency ?? 'USDC').toUpperCase(),
          p_amount: totalToRelease,
        });

        this.logger.log(
          `💰 Reserva liberada para orden fallida: ${totalToRelease} ${order.currency}`,
        );
      }
    }

    // 2. Manejar ledgers 'settled' (es decir, el balance ya fue deducto definitivamente)
    // Para devoluciones en este punto, necesitamos emitir un reembolso (credit).
    const { data: settledLedgers } = await this.supabase
      .from('ledger_entries')
      .select('amount, type')
      .eq('reference_type', 'payment_order')
      .eq('reference_id', orderId)
      .eq('status', 'settled')
      .eq('type', 'debit');

    if (settledLedgers && settledLedgers.length > 0 && order.wallet_id) {
      const totalToRefund = settledLedgers.reduce(
        (sum, l) => sum + parseFloat(l.amount),
        0,
      );

      if (totalToRefund > 0) {
        await this.supabase.from('ledger_entries').insert({
          wallet_id: order.wallet_id,
          type: 'credit',
          amount: totalToRefund,
          currency: order.currency,
          status: 'settled',
          reference_type: 'payment_order',
          reference_id: orderId,
          description: `Reembolso por orden fallida/rechazada`,
        });

        this.logger.log(
          `💰 Reembolso emitido para orden fallida: ${totalToRefund} ${order.currency}`,
        );
      }
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
