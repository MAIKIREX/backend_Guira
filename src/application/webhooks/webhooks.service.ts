import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';

interface SinkEventDto {
  provider: string;
  event_type: string;
  provider_event_id: string | null;
  raw_payload: Record<string, unknown>;
  headers: Record<string, string | null>;
  bridge_api_version: string | null;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
  ) {}

  /** Guarda el webhook raw en la tabla webhook_events (no procesa nada) */
  async sinkEvent(dto: SinkEventDto): Promise<void> {
    const { error } = await this.supabase.from('webhook_events').insert({
      provider: dto.provider,
      event_type: dto.event_type,
      provider_event_id: dto.provider_event_id,
      raw_payload: dto.raw_payload,
      headers: dto.headers,
      bridge_api_version: dto.bridge_api_version,
      status: 'pending',
      signature_verified: false,
    });

    if (error) {
      // Si ya existe el provider_event_id → idempotente, ignorar
      if (error.code === '23505') {
        this.logger.warn(`Evento duplicado ignorado: ${dto.provider_event_id}`);
        return;
      }
      this.logger.error(`Error guardando webhook: ${error.message}`);
    }
  }

  /** Verifica la firma HMAC-SHA256 de Bridge */
  private verifyBridgeSignature(
    payload: Record<string, unknown>,
    signature: string | null,
  ): boolean {
    const secret = this.config.get<string>('app.bridgeWebhookSecret');
    if (!secret || !signature) return false;

    const expected = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex')}`;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected),
      );
    } catch {
      return false;
    }
  }

  /**
   * CRON WORKER — se ejecuta cada 30 segundos.
   * Lee los webhooks pendientes y los procesa en orden FIFO.
   */
  @Cron('*/30 * * * * *', { name: 'process-webhooks' })
  async processWebhooks(): Promise<void> {
    const { data: events, error } = await this.supabase
      .from('webhook_events')
      .select('*')
      .eq('status', 'pending')
      .lt('retry_count', 5)
      .order('received_at', { ascending: true })
      .limit(50);

    if (error) {
      this.logger.error(`CRON error leyendo webhooks: ${error.message}`);
      return;
    }

    if (!events || events.length === 0) return;

    this.logger.log(`⚙️  CRON: procesando ${events.length} webhook(s)`);

    for (const event of events) {
      await this.processOne(event);
    }
  }

  private async processOne(event: Record<string, unknown>): Promise<void> {
    const id = event.id as string;

    // 1. Marcar como processing
    await this.supabase
      .from('webhook_events')
      .update({ status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', id);

    try {
      // 2. Verificar firma HMAC
      const headers = (event.headers as Record<string, string | null>) ?? {};
      const signature = headers['x-bridge-signature'] ?? null;
      const payload = event.raw_payload as Record<string, unknown>;
      const verified = this.verifyBridgeSignature(payload, signature);

      if (!verified && this.config.get('app.nodeEnv') === 'production') {
        this.logger.warn(`❌ Firma inválida en evento ${id} — ignorado`);
        await this.supabase
          .from('webhook_events')
          .update({ status: 'ignored' })
          .eq('id', id);
        return;
      }

      await this.supabase
        .from('webhook_events')
        .update({ signature_verified: verified })
        .eq('id', id);

      // 3. Despachar según event_type
      const eventType = event.event_type as string;
      await this.dispatchEvent(eventType, payload, event);

      // 4. Marcar como processed
      await this.supabase
        .from('webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', id);

      this.logger.log(`✅ Webhook procesado: ${eventType} (${id})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Error procesando webhook ${id}: ${message}`);

      const retryCount = (event.retry_count as number) + 1;
      const newStatus = retryCount >= 5 ? 'failed' : 'pending';

      await this.supabase
        .from('webhook_events')
        .update({
          status: newStatus,
          retry_count: retryCount,
          last_error: message,
        })
        .eq('id', id);
    }
  }

  /** Router de eventos — cada tipo ejecuta su lógica específica */
  private async dispatchEvent(
    eventType: string,
    payload: Record<string, unknown>,
    _event: Record<string, unknown>,
  ): Promise<void> {
    switch (eventType) {
      case 'virtual_account.funds_received':
        await this.handleFundsReceived(payload);
        break;

      case 'transfer.payment_processed':
        await this.handleTransferPaymentProcessed(payload);
        break;

      case 'transfer.complete':
        await this.handleTransferComplete(payload);
        break;

      case 'transfer.failed':
        await this.handleTransferFailed(payload);
        break;

      case 'kyc_link.approved':
        await this.handleKycApproved(payload);
        break;

      case 'kyb_link.approved':
        await this.handleKybApproved(payload);
        break;

      case 'liquidation_address.payment_completed':
        await this.handleLiquidationPayment(payload);
        break;

      default:
        this.logger.warn(`Evento desconocido ignorado: ${eventType}`);
    }
  }

  // ── Handlers individuales ─────────────────────────────────────────

  private async handleFundsReceived(payload: Record<string, unknown>): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    if (!data) return;
    // Buscar la virtual account y actualizar payment_order + ledger
    const vaId = data.virtual_account_id as string;
    const amount = parseFloat(data.amount as string);

    const { data: va } = await this.supabase
      .from('bridge_virtual_accounts')
      .select('user_id, currency')
      .eq('va_id', vaId)
      .single();

    if (!va) {
      this.logger.warn(`Virtual account no encontrada: ${vaId}`);
      return;
    }

    // Insertar ledger entry (el trigger actualiza balances automáticamente)
    await this.supabase.from('ledger_entries').insert({
      user_id: va.user_id,
      entry_type: 'credit',
      amount,
      currency: va.currency ?? 'usd',
      description: `Depósito recibido en VA ${vaId}`,
      source_type: 'virtual_account',
      source_id: vaId,
      status: 'settled',
    });
  }

  private async handleTransferPaymentProcessed(payload: Record<string, unknown>): Promise<void> {
    const transferId = (payload?.data as Record<string, unknown>)?.id as string;
    if (!transferId) return;
    await this.supabase
      .from('bridge_transfers')
      .update({ bridge_state: 'payment_processed' })
      .eq('bridge_transfer_id', transferId);
  }

  private async handleTransferComplete(payload: Record<string, unknown>): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    const transferId = data?.id as string;
    if (!transferId) return;

    await this.supabase
      .from('bridge_transfers')
      .update({ bridge_state: 'complete', completed_at: new Date().toISOString() })
      .eq('bridge_transfer_id', transferId);
  }

  private async handleTransferFailed(payload: Record<string, unknown>): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    const transferId = data?.id as string;
    if (!transferId) return;

    await this.supabase
      .from('bridge_transfers')
      .update({ bridge_state: 'failed' })
      .eq('bridge_transfer_id', transferId);
  }

  private async handleKycApproved(payload: Record<string, unknown>): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    const kycLinkId = data?.id as string;
    if (!kycLinkId) return;

    const { data: link } = await this.supabase
      .from('bridge_kyc_links')
      .select('user_id')
      .eq('kyc_link_id', kycLinkId)
      .single();

    if (!link) return;

    await this.supabase
      .from('kyc_applications')
      .update({ status: 'approved' })
      .eq('user_id', link.user_id);

    await this.supabase
      .from('profiles')
      .update({ onboarding_status: 'verified' })
      .eq('id', link.user_id);
  }

  private async handleKybApproved(payload: Record<string, unknown>): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    const customerId = data?.customer_id as string;
    if (!customerId) return;

    const { data: kyb } = await this.supabase
      .from('kyb_applications')
      .select('user_id')
      .eq('bridge_customer_id', customerId)
      .maybeSingle();

    if (!kyb) return;

    await this.supabase
      .from('profiles')
      .update({
        onboarding_status: 'verified',
        bridge_customer_id: customerId,
      })
      .eq('id', kyb.user_id);
  }

  private async handleLiquidationPayment(payload: Record<string, unknown>): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    const addressId = data?.liquidation_address_id as string;
    const amount = parseFloat((data?.amount as string) ?? '0');
    if (!addressId || !amount) return;

    const { data: addr } = await this.supabase
      .from('bridge_liquidation_addresses')
      .select('user_id, destination_currency')
      .eq('bridge_address_id', addressId)
      .single();

    if (!addr) return;

    await this.supabase.from('ledger_entries').insert({
      user_id: addr.user_id,
      entry_type: 'credit',
      amount,
      currency: addr.destination_currency ?? 'usd',
      description: `Liquidación recibida en dirección ${addressId}`,
      source_type: 'liquidation_address',
      source_id: addressId,
      status: 'settled',
    });
  }
}
