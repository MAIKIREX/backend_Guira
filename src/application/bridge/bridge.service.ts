import {
  Injectable, Inject, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { CreatePayoutRequestDto } from './dto/create-payout.dto';

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
  ) {}

  private get bridgeHeaders() {
    const apiKey = this.config.get<string>('app.bridgeApiKey');
    return {
      'Content-Type': 'application/json',
      'Api-Key': apiKey ?? '',
    };
  }

  private get bridgeBaseUrl() {
    return this.config.get<string>('app.bridgeApiUrl') ?? 'https://api.bridge.xyz';
  }

  // ── Payout Requests ───────────────────────────────────────────────

  /** Crea una solicitud de pago (payout). No llama aún a Bridge — espera aprobación interna */
  async createPayoutRequest(userId: string, dto: CreatePayoutRequestDto) {
    // Verificar que el perfil esté verificado y no congelado
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('onboarding_status, is_frozen, is_active')
      .eq('id', userId)
      .single();

    if (profileError || !profile) throw new NotFoundException('Perfil no encontrado');
    if (profile.is_frozen) throw new BadRequestException('Cuenta congelada — operaciones bloqueadas');
    if (!profile.is_active) throw new BadRequestException('Cuenta inactiva');
    if (profile.onboarding_status !== 'verified') {
      throw new BadRequestException('KYB no verificado — completa el onboarding primero');
    }

    // Verificar balance suficiente
    const { data: balance } = await this.supabase
      .from('balances')
      .select('available_balance')
      .eq('user_id', userId)
      .eq('currency', dto.source_currency.toLowerCase())
      .single();

    const available = parseFloat(balance?.available_balance ?? '0');
    if (available < dto.amount_usd) {
      throw new BadRequestException(`Balance insuficiente. Disponible: ${available} ${dto.source_currency}`);
    }

    const { data, error } = await this.supabase
      .from('payout_requests')
      .insert({
        user_id: userId,
        wallet_id: dto.wallet_id,
        payout_type: dto.payout_type,
        amount_usd: dto.amount_usd,
        source_currency: dto.source_currency.toLowerCase(),
        destination_currency: dto.destination_currency.toLowerCase(),
        destination_details: dto.destination_details,
        description: dto.description,
        status: 'pending_approval',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  /** Lista payout requests del usuario */
  async listPayoutRequests(userId: string) {
    const { data, error } = await this.supabase
      .from('payout_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ── Transfers ─────────────────────────────────────────────────────

  /** Historial de transferencias Bridge del usuario */
  async listTransfers(userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_transfers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Obtiene una transferencia por ID */
  async getTransfer(transferId: string, userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_transfers')
      .select('*')
      .eq('id', transferId)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Transferencia no encontrada');
    return data;
  }

  // ── Virtual Accounts ──────────────────────────────────────────────

  /** Cuentas virtuales del usuario (para recibir fondos USD/fiat) */
  async listVirtualAccounts(userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_virtual_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ── External Accounts ─────────────────────────────────────────────

  /** Lista cuentas bancarias externas registradas del usuario */
  async listExternalAccounts(userId: string) {
    const { data, error } = await this.supabase
      .from('bridge_external_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ── Bridge API Proxy (llamadas directas con service_role) ─────────

  /** Obtiene el estado real de una transferencia desde Bridge API */
  async syncTransferFromBridge(bridgeTransferId: string, userId: string): Promise<void> {
    const apiKey = this.config.get<string>('app.bridgeApiKey');
    if (!apiKey) {
      this.logger.warn('BRIDGE_API_KEY no configurada — sync omitido');
      return;
    }

    try {
      const res = await fetch(`${this.bridgeBaseUrl}/v0/transfers/${bridgeTransferId}`, {
        headers: this.bridgeHeaders,
      });

      if (!res.ok) {
        this.logger.error(`Bridge API error: ${res.status}`);
        return;
      }

      const bridgeData = await res.json() as Record<string, unknown>;

      await this.supabase
        .from('bridge_transfers')
        .update({
          bridge_state: bridgeData.state,
          bridge_amount: bridgeData.amount,
          updated_at: new Date().toISOString(),
        })
        .eq('bridge_transfer_id', bridgeTransferId)
        .eq('user_id', userId);
    } catch (err) {
      this.logger.error(`Error syncing transfer ${bridgeTransferId}: ${err}`);
    }
  }
}
