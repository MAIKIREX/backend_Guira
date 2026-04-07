import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { BridgeApiClient } from '../bridge/bridge-api.client';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
    private readonly bridgeApi: BridgeApiClient,
  ) {}

  // ───────────────────────────────────────────────
  //  Endpoints de usuario
  // ───────────────────────────────────────────────

  /** Lista wallets activas del usuario junto con su balance. */
  async findAllByUser(userId: string) {
    const { data: wallets, error } = await this.supabase
      .from('wallets')
      .select('id, currency, address, network, provider_key, label, is_active, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    if (!wallets || wallets.length === 0) return [];

    // Obtener balances para enriquecer cada wallet
    const { data: balances } = await this.supabase
      .from('balances')
      .select('currency, amount, available_amount, reserved_amount')
      .eq('user_id', userId);

    const balanceMap = new Map<string, { amount: number; available_amount: number; reserved_amount: number }>(
      (balances ?? []).map((b) => [
        b.currency?.toUpperCase(),
        {
          amount: parseFloat(b.amount ?? '0') || 0,
          available_amount: parseFloat(b.available_amount ?? '0') || 0,
          reserved_amount: parseFloat(b.reserved_amount ?? '0') || 0,
        },
      ]),
    );

    return wallets.map((w) => {
      const bal = balanceMap.get(w.currency?.toUpperCase()) ?? {
        amount: 0,
        available_amount: 0,
        reserved_amount: 0,
      };
      return {
        id: w.id,
        currency: w.currency,
        address: w.address,
        network: w.network,
        provider: w.provider_key ?? 'bridge',
        label: w.label,
        is_active: w.is_active,
        created_at: w.created_at,
        balance: bal.amount,
        available_balance: bal.available_amount,
        reserved_balance: bal.reserved_amount,
      };
    });
  }

  /** Obtiene wallet específica verificando propiedad. */
  async findOne(walletId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Wallet no encontrada');
    return data;
  }

  /** Balances del usuario (todas las monedas). */
  async getBalances(userId: string) {
    const { data, error } = await this.supabase
      .from('balances')
      .select('id, currency, amount, available_amount, pending_amount, reserved_amount, updated_at')
      .eq('user_id', userId)
      .order('currency', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Balance de una divisa específica. */
  async getBalanceByCurrency(userId: string, currency: string) {
    const { data, error } = await this.supabase
      .from('balances')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', currency.toUpperCase())
      .single();

    if (error || !data) {
      throw new NotFoundException(`No existe balance para ${currency}`);
    }
    return data;
  }

  /** Rutas de payin del usuario (cuentas virtuales). */
  async getPayinRoutes(userId: string) {
    const { data, error } = await this.supabase
      .from('payin_routes')
      .select(`
        *,
        bridge_virtual_accounts (
          id, va_id, currency, status, bank_name, account_number, routing_number
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  // ───────────────────────────────────────────────
  //  Servicios internos — Inicialización de cliente
  // ───────────────────────────────────────────────

  /**
   * Inicializa las wallets de un cliente aprobado.
   * Lee el bridge_customer_id del perfil del usuario si no se provee.
   * Lee la configuración de wallets desde app_settings.
   * Crea wallets en Bridge API y guarda los datos en la DB.
   */
  async initializeClientWallets(
    userId: string,
    bridgeCustomerId?: string,
  ): Promise<{ initialized: number; message: string }> {
    // Si no se provee, leer del perfil
    let customerId = bridgeCustomerId ?? null;
    if (!customerId) {
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('bridge_customer_id')
        .eq('id', userId)
        .single();
      customerId = profile?.bridge_customer_id ?? null;
    }

    if (!customerId) {
      throw new NotFoundException(
        `El usuario ${userId} no tiene bridge_customer_id — no se pueden crear wallets en Bridge.`,
      );
    }

    // Leer configuración desde app_settings
    const walletConfigs = await this.getWalletConfigs();
    let initialized = 0;

    for (const wc of walletConfigs) {
      // Verificar duplicados
      const { data: existing } = await this.supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('currency', wc.currency.toUpperCase())
        .eq('network', wc.network)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) continue;

      // Crear en Bridge API
      const bridgeWallet = await this.createBridgeWallet(
        customerId,
        wc.currency,
        wc.network,
      );

      // Guardar en DB
      await this.supabase.from('wallets').insert({
        user_id: userId,
        currency: wc.currency.toUpperCase(),
        address: bridgeWallet.address,
        network: wc.network,
        provider_key: 'bridge',
        provider_wallet_id: bridgeWallet.id,
        label: `${wc.currency.toUpperCase()} (${wc.network})`,
        is_active: true,
      });

      initialized++;
    }

    // Inicializar balances
    await this.initializeBalances(
      userId,
      walletConfigs.map((c) => c.currency.toUpperCase()),
    );

    this.logger.log(
      `Wallets inicializados para usuario ${userId}: ${initialized} nuevas de ${walletConfigs.length} configuraciones`,
    );

    return {
      initialized,
      message: `${initialized} wallet(s) inicializadas correctamente para el usuario ${userId}.`,
    };
  }

  /**
   * Inicializa filas de balance con valor 0 para las monedas indicadas.
   * Siempre incluye USD (fiat base).
   */
  async initializeBalances(
    userId: string,
    currencies: string[],
  ): Promise<void> {
    const uniqueCurrencies = [...new Set([...currencies, 'USD'])];

    for (const currency of uniqueCurrencies) {
      // Verificar si ya existe
      const { data: existing } = await this.supabase
        .from('balances')
        .select('id')
        .eq('user_id', userId)
        .eq('currency', currency)
        .maybeSingle();

      if (existing) continue;

      await this.supabase.from('balances').insert({
        user_id: userId,
        currency,
        amount: 0,
        available_amount: 0,
        pending_amount: 0,
        reserved_amount: 0,
      });
    }
  }

  // ───────────────────────────────────────────────
  //  Admin — Ajuste manual de balance
  // ───────────────────────────────────────────────

  /** Ajuste manual de balance por parte de un admin (con audit_log). */
  async adjustBalance(
    targetUserId: string,
    currency: string,
    adjustmentAmount: number,
    reason: string,
    actorId: string,
  ) {
    const upperCurrency = currency.toUpperCase();

    // Obtener balance actual
    const { data: balance, error } = await this.supabase
      .from('balances')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('currency', upperCurrency)
      .single();

    if (error || !balance) {
      throw new NotFoundException(
        `No existe balance de ${upperCurrency} para el usuario`,
      );
    }

    const newAmount = parseFloat(balance.amount) + adjustmentAmount;
    const newAvailable = parseFloat(balance.available_amount) + adjustmentAmount;

    if (newAvailable < 0) {
      throw new BadRequestException(
        'El ajuste resultaría en un saldo disponible negativo',
      );
    }

    // Actualizar balance
    const { data: updated, error: updateErr } = await this.supabase
      .from('balances')
      .update({
        amount: newAmount,
        available_amount: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq('id', balance.id)
      .select()
      .single();

    if (updateErr) throw new BadRequestException(updateErr.message);

    // Audit log
    await this.supabase.from('audit_logs').insert({
      actor_id: actorId,
      action: 'balance_manual_adjustment',
      entity_type: 'balance',
      entity_id: balance.id,
      details: {
        user_id: targetUserId,
        currency: upperCurrency,
        adjustment: adjustmentAmount,
        previous_amount: balance.amount,
        new_amount: newAmount,
        reason,
      },
    });

    this.logger.log(
      `Ajuste de balance: ${adjustmentAmount} ${upperCurrency} para ${targetUserId} por ${actorId}`,
    );

    return updated;
  }

  // ───────────────────────────────────────────────
  //  Helpers privados
  // ───────────────────────────────────────────────

  private async getWalletConfigs(): Promise<
    Array<{ currency: string; network: string }>
  > {
    const { data } = await this.supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'SUPPORTED_WALLET_CONFIGS')
      .single();

    try {
      return JSON.parse(
        data?.value ?? '[{"currency":"usdc","network":"ethereum"}]',
      );
    } catch {
      return [{ currency: 'usdc', network: 'ethereum' }];
    }
  }

  /**
   * Crea una Bridge Wallet vía Bridge API.
   *
   * Según la documentación de Bridge:
   * - Endpoint: POST /v0/customers/{customerID}/wallets
   * - Body requerido: { chain } (enum: base, ethereum, solana, tempo, tron)
   * - Header requerido: Idempotency-Key
   * - Respuesta: { id, chain, address, created_at, updated_at }
   */
  private async createBridgeWallet(
    bridgeCustomerId: string,
    _currency: string,
    network: string,
  ): Promise<{ id: string; address: string; chain: string }> {
    const idempotencyKey = `wallet-${bridgeCustomerId}-${network}-${Date.now()}`;

    const response = await this.bridgeApi.post<{
      id: string;
      chain: string;
      address: string;
      created_at: string;
      updated_at: string;
    }>(
      `/v0/customers/${bridgeCustomerId}/wallets`,
      { chain: network },
      idempotencyKey,
    );

    return {
      id: response.id,
      address: response.address,
      chain: response.chain,
    };
  }
}
