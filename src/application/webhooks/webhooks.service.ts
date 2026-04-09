import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase.module';
import { BridgeApiClient } from '../bridge/bridge-api.client';

interface SinkEventDto {
  provider: string;
  event_type: string;
  provider_event_id: string | null;
  raw_payload: Record<string, unknown>;
  // Buffer crudo de la petición — requerido para verificación de firma Bridge
  raw_body: Buffer;
  headers: Record<string, string | null>;
  bridge_api_version: string | null;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
    private readonly bridgeApi: BridgeApiClient,
  ) {}

  // ═══════════════════════════════════════════════
  //  WEBHOOK SINK — Persiste y responde 200
  // ═══════════════════════════════════════════════

  async sinkEvent(dto: SinkEventDto): Promise<void> {
    // Verificar firma ANTES del INSERT mientras el raw body original está en memoria.
    // Esta es la única oportunidad de verificar de forma fidedigna — en el CRON el
    // body ha sido re-serializado desde JSON y no coincide byte a byte con el original.
    const signatureHeader = dto.headers['x-webhook-signature'] ?? null;
    const signatureVerified = this.verifyBridgeSignature(
      dto.raw_body,
      signatureHeader,
    );

    if (!signatureVerified) {
      this.logger.warn(
        `⚠️  Firma Bridge no verificada para evento ${dto.provider_event_id ?? dto.event_type}`,
      );
    }

    const { error } = await this.supabase.from('webhook_events').insert({
      provider: dto.provider,
      event_type: dto.event_type,
      provider_event_id: dto.provider_event_id,
      raw_payload: dto.raw_payload,
      headers: dto.headers,
      bridge_api_version: dto.bridge_api_version,
      status: 'pending',
      signature_verified: signatureVerified, // valor real, no hardcoded false
    });

    if (error) {
      if (error.code === '23505') {
        this.logger.warn(`Evento duplicado ignorado: ${dto.provider_event_id}`);
        return;
      }
      this.logger.error(`Error guardando webhook: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════
  //  CRON WORKER — Cada 30s, FIFO, max 50
  // ═══════════════════════════════════════════════

  @Cron('*/30 * * * * *', { name: 'process-webhooks' })
  async processWebhooks(): Promise<void> {
    // ── 1. Rescatar eventos atascados en 'processing' por más de 2 minutos ──────
    // Ocurre cuando el proceso fue interrumpido a mitad del processOne().
    const stuckCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: stuckEvents } = await this.supabase
      .from('webhook_events')
      .select('id')
      .eq('status', 'processing')
      .lt('processing_started_at', stuckCutoff)
      .lt('retry_count', 5)
      .limit(10);

    if (stuckEvents && stuckEvents.length > 0) {
      this.logger.warn(
        `🔄 Rescatando ${stuckEvents.length} evento(s) atascados en 'processing'`,
      );
      await this.supabase
        .from('webhook_events')
        .update({ status: 'pending' })
        .in(
          'id',
          stuckEvents.map((e) => e.id),
        );
    }

    // ── 2. Procesar eventos pendientes ───────────────────────────────────────────
    const { data: events, error } = await this.supabase
      .from('webhook_events')
      .select('*')
      .eq('status', 'pending')
      .lt('retry_count', 5)
      .order('received_at', { ascending: true })
      .limit(50);

    if (error) {
      this.logger.error(`CRON error: ${error.message}`);
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

    await this.supabase
      .from('webhook_events')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', id);

    try {
      // La firma ya fue verificada en sinkEvent() con el raw body original.
      // Aquí solo leemos el resultado guardado — NO re-verificamos con un buffer
      // re-serializado desde JSON (no coincide byte a byte con el original de Bridge).
      const signatureVerified = event.signature_verified as boolean;

      if (
        !signatureVerified &&
        this.config.get('app.nodeEnv') === 'production'
      ) {
        this.logger.warn(
          `❌ Firma inválida en evento ${id} — ignorado en producción`,
        );
        await this.supabase
          .from('webhook_events')
          .update({ status: 'ignored' })
          .eq('id', id);
        return;
      }

      // Despachar
      const eventType = event.event_type as string;
      const payload = event.raw_payload as Record<string, unknown>;
      await this.dispatchEvent(eventType, payload);

      // Marcar procesado
      await this.supabase
        .from('webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', id);

      this.logger.log(`✅ Webhook procesado: ${eventType} (${id})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Error procesando webhook ${id}: ${message}`);

      const retryCount = ((event.retry_count as number) ?? 0) + 1;
      const newStatus = retryCount >= 5 ? 'failed' : 'pending';

      await this.supabase
        .from('webhook_events')
        .update({
          status: newStatus,
          retry_count: retryCount,
          last_error: message,
        })
        .eq('id', id);

      // Si falla 5 veces → notificar admin
      if (retryCount >= 5) {
        await this.notifyAdminWebhookFailed(
          id,
          event.event_type as string,
          message,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  DISPATCHER
  // ═══════════════════════════════════════════════

  private async dispatchEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // Los event types aquí deben coincidir EXACTAMENTE con los que Bridge envía.
    // Bridge usa event_type en formato "category.verb" o "category.verb.qualifier".
    switch (eventType) {
      // ── Customer lifecycle ────────────────────────────────────────────────────
      case 'customer.created':
        await this.handleCustomerCreated(payload);
        break;
      case 'customer.updated':
      case 'customer.updated.status_transitioned':
        await this.handleCustomerUpdated(payload);
        break;

      // ── KYC link lifecycle ────────────────────────────────────────────────────
      case 'kyc_link.created':
        // Solo log — no hay acción de negocio requerida en creación
        this.logger.log(`kyc_link.created: ${payload?.event_object_id}`);
        break;
      case 'kyc_link.updated.status_transitioned':
        await this.handleKycLinkStatusTransitioned(payload);
        break;
      // Alias legacy — Bridge enviaba este tipo en versiones anteriores
      case 'kyc_link.approved':
        await this.handleKycApproved(payload);
        break;

      // ── Transfers ─────────────────────────────────────────────────────────────
      case 'transfer.created':
        this.logger.log(`transfer.created: ${payload?.event_object_id}`);
        break;
      case 'transfer.updated.status_transitioned':
      case 'transfer.updated': {
        const data = (payload.event_object || payload.data) as Record<string, unknown>;
        const state = data?.state as string;
        if (state === 'payment_processed') {
          await this.handleTransferPaymentProcessed(payload);
        } else if (state === 'complete' || state === 'completed') {
          await this.handleTransferComplete(payload);
        } else if (state === 'failed' || state === 'returned') {
          await this.handleTransferFailed(payload);
        } else {
          this.logger.log(`transfer status_transitioned a ${state} - guardando progreso sin acción adicional`);
        }
        break;
      }
      // Alias legacy
      case 'transfer.payment_processed':
        await this.handleTransferPaymentProcessed(payload);
        break;
      case 'transfer.complete':
        await this.handleTransferComplete(payload);
        break;
      case 'transfer.failed':
        await this.handleTransferFailed(payload);
        break;

      // ── Virtual accounts ──────────────────────────────────────────────────────
      case 'virtual_account.funds_received':
        await this.handleFundsReceived(payload);
        break;

      // ── Liquidation ───────────────────────────────────────────────────────────
      case 'liquidation_address.payment_completed':
        await this.handleLiquidationPayment(payload);
        break;

      default:
        this.logger.warn(
          `⚠️ Evento Bridge sin handler: ${eventType} — registrado pero no procesado`,
        );
    }
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: customer.created
  //  Bridge confirma que el customer fue creado. Persistimos el bridge_customer_id
  //  si a\u00fan no está guardado (el approveReview ya lo guarda, esto es idempotente).
  // ═══════════════════════════════════════════════

  private async handleCustomerCreated(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const eventObject = payload.event_object as
      | Record<string, unknown>
      | undefined;
    const customerId = eventObject?.id as string | undefined;
    const email = eventObject?.email as string | undefined;

    if (!customerId || !email) {
      this.logger.warn('customer.created: payload sin id o email');
      return;
    }

    // Buscar perfil por email y guardar bridge_customer_id si aún no está
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('id, bridge_customer_id')
      .eq('email', email)
      .maybeSingle();

    if (!profile) {
      this.logger.warn(
        `customer.created: no se encontró profile para email ${email}`,
      );
      return;
    }

    if (!profile.bridge_customer_id) {
      await this.supabase
        .from('profiles')
        .update({ bridge_customer_id: customerId })
        .eq('id', profile.id);
      this.logger.log(
        `customer.created: bridge_customer_id ${customerId} guardado para user ${profile.id}`,
      );
    }
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: customer.updated / customer.updated.status_transitioned
  //  Cuando Bridge cambia el status del customer (ej. incomplete → active),
  //  actualizamos el perfil y \u2014 si llega a active \u2014 inicializamos wallets.
  // ═══════════════════════════════════════════════

  private async handleCustomerUpdated(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const eventObject = payload.event_object as
      | Record<string, unknown>
      | undefined;
    const customerId = eventObject?.id as string | undefined;
    const email = eventObject?.email as string | undefined;
    const newStatus = payload.event_object_status as string | undefined;

    if (!customerId || !email) return;

    // Solo actuar en transiciones a 'active' (customer completamente verificado)
    if (newStatus !== 'active') {
      this.logger.log(
        `customer.updated: status=${newStatus} para customer ${customerId} — sin acción`,
      );
      return;
    }

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('id, bridge_customer_id, onboarding_status')
      .eq('email', email)
      .maybeSingle();

    if (!profile) {
      this.logger.warn(
        `customer.updated: no se encontró profile para email ${email}`,
      );
      return;
    }

    // Actualizar bridge_customer_id y onboarding_status si es necesario
    const updates: Record<string, unknown> = {};
    if (!profile.bridge_customer_id) updates.bridge_customer_id = customerId;
    if (profile.onboarding_status !== 'approved')
      updates.onboarding_status = 'approved';

    if (Object.keys(updates).length > 0) {
      await this.supabase.from('profiles').update(updates).eq('id', profile.id);
    }

    // Inicializar wallets si no existen aún
    await this.initializeWalletsForUser(profile.id, customerId);

    this.logger.log(
      `customer.updated: customer ${customerId} → active, wallets inicializadas para user ${profile.id}`,
    );
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: kyc_link.updated.status_transitioned
  //  Este es el evento REAL que Bridge envía cuando el KYC es aprobado.
  //  Usa event_object (no data). Ejecuta la lógica de aprobación completa.
  // ═══════════════════════════════════════════════

  private async handleKycLinkStatusTransitioned(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const eventObject = payload.event_object as
      | Record<string, unknown>
      | undefined;
    const kycStatus = eventObject?.kyc_status as string | undefined;

    // Solo actuar si el KYC fue aprobado
    if (kycStatus !== 'approved') {
      this.logger.log(
        `kyc_link.updated.status_transitioned: kyc_status=${kycStatus} — sin acción`,
      );
      return;
    }

    const customerId = eventObject?.customer_id as string | undefined;
    const email = eventObject?.email as string | undefined;
    const customerType = (eventObject?.type as string) ?? 'individual';

    if (!customerId) {
      this.logger.warn(
        'kyc_link.updated.status_transitioned: payload sin customer_id',
      );
      return;
    }

    // Buscar perfil por bridge_customer_id o email
    let profile: { id: string } | null = null;

    const { data: byCustomerId } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('bridge_customer_id', customerId)
      .maybeSingle();
    profile = byCustomerId;

    if (!profile && email) {
      const { data: byEmail } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      profile = byEmail;
    }

    if (!profile) {
      this.logger.warn(
        `kyc_link.updated.status_transitioned: no se encontró profile para customer ${customerId}`,
      );
      return;
    }

    const userId = profile.id;

    // Actualizar la aplicación correcta según tipo de customer
    if (customerType === 'business') {
      await this.supabase
        .from('kyb_applications')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .in('status', ['submitted', 'under_review', 'pending']);
    } else {
      await this.supabase
        .from('kyc_applications')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .in('status', ['submitted', 'under_review', 'pending']);
    }

    // Actualizar perfil
    await this.supabase
      .from('profiles')
      .update({
        onboarding_status: 'approved',
        bridge_customer_id: customerId,
      })
      .eq('id', userId);

    // Inicializar wallets
    await this.initializeWalletsForUser(userId, customerId);

    // Notificación
    const typeLabel = customerType === 'business' ? 'KYB' : 'KYC';
    await this.supabase.from('notifications').insert({
      user_id: userId,
      type: 'onboarding',
      title: `Verificación ${typeLabel} Aprobada`,
      message: `Tu verificación ${typeLabel} ha sido aprobada. Ya puedes operar en la plataforma.`,
    });

    // Activity log
    await this.supabase.from('activity_logs').insert({
      user_id: userId,
      action: `${typeLabel}_APPROVED_WEBHOOK`,
      description: `Verificación ${typeLabel} confirmada por Bridge webhook — customer: ${customerId}`,
    });

    this.logger.log(
      `✅ kyc_link aprobado para customer ${customerId} (user ${userId})`,
    );
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: funds_received (REFACTORIZADO)
  // ═══════════════════════════════════════════════

  private async handleFundsReceived(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    if (!data) throw new Error('Payload sin data');

    const vaId = data.virtual_account_id as string;
    const amount = parseFloat(data.amount as string);
    const senderName = (data.sender_name as string) ?? 'Desconocido';
    const currency = (data.currency as string) ?? 'usd';

    // 1. Buscar VA — incluyendo flags de external sweep
    const { data: va, error: vaErr } = await this.supabase
      .from('bridge_virtual_accounts')
      .select(
        'id, user_id, destination_wallet_id, source_currency, developer_fee_percent, is_external_sweep, destination_address, external_destination_label',
      )
      .eq('bridge_virtual_account_id', vaId)
      .single();

    if (vaErr || !va) throw new Error(`VA no encontrada: ${vaId}`);

    // 2. INSERT bridge_virtual_account_events (siempre, para auditoría)
    await this.supabase.from('bridge_virtual_account_events').insert({
      bridge_virtual_account_id: vaId,
      bridge_event_id: (payload.id as string) ?? null,
      event_type: 'virtual_account.funds_received',
      amount,
      currency,
      sender_name: senderName,
      raw_payload: payload,
    });

    // 3. Calcular fee (aplica en ambos escenarios)
    const devFeePercent = parseFloat(va.developer_fee_percent ?? '0') || 1.0;
    const feeAmount = parseFloat(((amount * devFeePercent) / 100).toFixed(2));
    const netAmount = parseFloat((amount - feeAmount).toFixed(2));

    // ═══════════════════════════════════════════════════════════
    //  BIFURCACIÓN: ¿Destino interno (Guira) o externo (Binance, etc.)?
    // ═══════════════════════════════════════════════════════════

    if (va.is_external_sweep) {
      // ── CASO B: External Sweep (Doble Asiento Contable) ──────
      // Los fondos fueron enviados por Bridge a una wallet FUERA de Guira.
      // Guira no controla ese dinero, así que:
      //   Credit (+$990) + Debit (-$990) = Balance neto $0.00
      await this.handleExternalSweepDeposit(
        va,
        amount,
        feeAmount,
        netAmount,
        currency,
        senderName,
        payload,
      );
    } else {
      // ── CASO A: Fondeo Interno (Wallet de Guira) ─────────────
      // Los fondos se quedan en la plataforma → incrementar balance
      await this.handleInternalDeposit(
        va,
        amount,
        feeAmount,
        netAmount,
        currency,
        senderName,
        payload,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  CASO A: Depósito Interno (fondos se quedan en Guira)
  // ═══════════════════════════════════════════════════════════

  private async handleInternalDeposit(
    va: Record<string, unknown>,
    amount: number,
    feeAmount: number,
    netAmount: number,
    currency: string,
    senderName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const userId = va.user_id as string;

    // Obtener wallet interna del usuario
    let walletId = va.destination_wallet_id as string | null;
    if (!walletId) {
      const { data: wallet } = await this.supabase
        .from('wallets')
        .select('id, currency')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!wallet) throw new Error(`Wallet no encontrada para user ${userId}`);
      walletId = wallet.id;
    }

    // INSERT payment_order
    const { data: order } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: walletId,
        source_type: 'bridge_virtual_account',
        source_reference_id: va.id,
        amount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        currency: (va.source_currency as string) ?? currency,
        sender_name: senderName,
        bridge_event_id: (payload.id as string) ?? null,
        status: 'completed',
      })
      .select('id')
      .single();

    // INSERT ledger_entry (credit, settled → trigger de DB actualiza balance)
    await this.supabase.from('ledger_entries').insert({
      wallet_id: walletId,
      type: 'credit',
      amount: netAmount,
      currency: (va.source_currency as string) ?? currency,
      status: 'settled',
      reference_type: 'payment_order',
      reference_id: order?.id ?? null,
      description: `Depósito recibido — ${senderName} ($${amount})`,
    });

    // Notificación
    await this.supabase.from('notifications').insert({
      user_id: userId,
      type: 'financial',
      title: 'Depósito Confirmado',
      message: `Recibiste $${netAmount.toFixed(2)} en tu wallet Guira (fee: $${feeAmount.toFixed(2)})`,
      reference_type: 'payment_order',
      reference_id: order?.id ?? null,
    });

    // Activity log
    await this.supabase.from('activity_logs').insert({
      user_id: userId,
      action: 'DEPOSIT_RECEIVED',
      description: `Depósito de $${amount} recibido de ${senderName} via VA → wallet interna`,
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  CASO B: External Sweep (Doble Asiento — Balance Neto $0)
  //  Los fondos ya salieron a Binance, MetaMask, etc.
  //  Credit + Debit inmediato = Balance Guira no se altera.
  // ═══════════════════════════════════════════════════════════

  private async handleExternalSweepDeposit(
    va: Record<string, unknown>,
    amount: number,
    feeAmount: number,
    netAmount: number,
    currency: string,
    senderName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const userId = va.user_id as string;
    const externalAddr =
      (va.destination_address as string) ?? 'Externa desconocida';
    const externalLabel =
      (va.external_destination_label as string) ?? externalAddr;

    // Wallet de referencia interna (para el asiento contable aunque los fondos no se queden)
    const { data: refWallet } = await this.supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!refWallet)
      throw new Error(`Wallet de referencia no encontrada para user ${userId}`);
    const refWalletId = refWallet.id;

    // 1. INSERT payment_order con status 'swept_external'
    const { data: order } = await this.supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        wallet_id: refWalletId,
        source_type: 'bridge_virtual_account',
        source_reference_id: va.id,
        amount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        currency: (va.source_currency as string) ?? currency,
        sender_name: senderName,
        bridge_event_id: (payload.id as string) ?? null,
        status: 'swept_external',
      })
      .select('id')
      .single();

    const orderId = order?.id ?? null;

    // 2. DOBLE ASIENTO CONTABLE (Credit + Debit instantáneo)
    //    Ambos con status 'settled' para que los triggers se procesen y se cancelen mutuamente.

    // Asiento 1: CRÉDITO — "El dinero entró desde la cuenta virtual"
    await this.supabase.from('ledger_entries').insert({
      wallet_id: refWalletId,
      type: 'credit',
      amount: netAmount,
      currency: (va.source_currency as string) ?? currency,
      status: 'settled',
      reference_type: 'payment_order',
      reference_id: orderId,
      description: `Depósito recibido — ${senderName} ($${amount}) [External Sweep]`,
    });

    // Asiento 2: DÉBITO — "El dinero salió automáticamente a wallet externa"
    await this.supabase.from('ledger_entries').insert({
      wallet_id: refWalletId,
      type: 'debit',
      amount: netAmount,
      currency: (va.source_currency as string) ?? currency,
      status: 'settled',
      reference_type: 'payment_order',
      reference_id: orderId,
      description: `Auto-sweep a wallet externa: ${externalLabel} (${externalAddr})`,
    });

    // 3. Notificación al cliente — informar que los fondos ya salieron
    await this.supabase.from('notifications').insert({
      user_id: userId,
      type: 'financial',
      title: 'Depósito Reenviado a Wallet Externa',
      message: `$${netAmount.toFixed(2)} de ${senderName} fue reenviado automáticamente a ${externalLabel} (fee: $${feeAmount.toFixed(2)})`,
      reference_type: 'payment_order',
      reference_id: orderId,
    });

    // 4. Activity log
    await this.supabase.from('activity_logs').insert({
      user_id: userId,
      action: 'DEPOSIT_EXTERNAL_SWEEP',
      description: `Depósito de $${amount} de ${senderName} → auto-sweep a ${externalLabel} (${externalAddr}). Neto: $${netAmount} (fee: $${feeAmount})`,
    });

    this.logger.log(
      `🔀 External sweep: $${netAmount} para user ${userId} → ${externalAddr}`,
    );
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: transfer.payment_processed
  // ═══════════════════════════════════════════════

  private async handleTransferPaymentProcessed(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = (payload?.event_object || payload?.data) as Record<string, unknown>;
    const transferId = data?.id as string;
    if (!transferId) return;

    await this.supabase
      .from('bridge_transfers')
      .update({
        bridge_state: 'payment_processed',
        updated_at: new Date().toISOString(),
      })
      .eq('bridge_transfer_id', transferId);
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: transfer.complete (REFACTORIZADO)
  //  [GAP 1 FIX] UPDATE ledger pending→settled, NO crear nuevo
  // ═══════════════════════════════════════════════

  private async handleTransferComplete(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = (payload?.event_object || payload?.data) as Record<string, unknown>;
    const bridgeTransferId = data?.id as string;
    if (!bridgeTransferId) throw new Error('transfer.complete sin transfer ID');

    const receipt = data?.receipt as Record<string, unknown> | undefined;

    // 1. UPDATE bridge_transfers
    const { data: transfer } = await this.supabase
      .from('bridge_transfers')
      .update({
        bridge_state: 'complete',
        status: 'completed',
        completed_at: new Date().toISOString(),
        receipt_initial_amount: receipt?.initial_amount ?? null,
        receipt_exchange_fee: receipt?.exchange_fee ?? null,
        receipt_developer_fee: receipt?.developer_fee ?? null,
        receipt_final_amount: receipt?.final_amount ?? null,
        destination_tx_hash: (data?.destination_tx_hash as string) ?? null,
        exchange_rate: receipt?.exchange_rate ?? null,
        bridge_raw_response: data,
        updated_at: new Date().toISOString(),
      })
      .eq('bridge_transfer_id', bridgeTransferId)
      .select('id, user_id, payout_request_id, amount')
      .single();

    if (!transfer)
      throw new Error(`Bridge transfer no encontrada: ${bridgeTransferId}`);

    // 2. UPDATE payout_requests
    if (transfer.payout_request_id) {
      await this.supabase
        .from('payout_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.payout_request_id);
    }

    // 2b. UPDATE payment_orders (si el transfer está vinculado a una order)
    const { data: paymentOrder } = await this.supabase
      .from('payment_orders')
      .select('id, user_id, wallet_id, flow_type, amount, fee_amount, currency')
      .eq('bridge_transfer_id', bridgeTransferId)
      .eq('status', 'processing')
      .maybeSingle();

    if (paymentOrder) {
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          tx_hash: (data?.destination_tx_hash as string) ?? null,
        })
        .eq('id', paymentOrder.id);

      // Asentar ledger entries vinculadas a la payment_order
      await this.supabase
        .from('ledger_entries')
        .update({ status: 'settled' })
        .eq('reference_type', 'payment_order')
        .eq('reference_id', paymentOrder.id)
        .eq('status', 'pending');

      this.logger.log(
        `✅ Payment order ${paymentOrder.id} completada vía webhook (transfer ${bridgeTransferId})`,
      );
    }

    // [GAP 1 FIX] 3. UPDATE ledger_entry existente: pending → settled
    // NO crear uno nuevo — el trigger de balance solo se activa al cambiar a settled
    await this.supabase
      .from('ledger_entries')
      .update({ status: 'settled' })
      .eq('bridge_transfer_id', transfer.id)
      .eq('status', 'pending');

    // 4. INSERT certificate
    const certNumber = `CERT-${Date.now()}-${transfer.id.slice(0, 8)}`;
    await this.supabase.from('certificates').insert({
      user_id: transfer.user_id,
      subject_type: 'bridge_transfer',
      subject_id: transfer.id,
      certificate_number: certNumber,
      amount: transfer.amount,
      currency: (data?.destination_currency as string) ?? 'usd',
      issued_at: new Date().toISOString(),
      metadata: receipt ?? {},
    });

    // 5. Notificación
    await this.supabase.from('notifications').insert({
      user_id: transfer.user_id,
      type: 'financial',
      title: 'Pago Completado',
      message: `Tu pago de $${transfer.amount} ha sido completado exitosamente`,
      reference_type: 'bridge_transfer',
      reference_id: transfer.id,
    });

    // 6. Activity log
    await this.supabase.from('activity_logs').insert({
      user_id: transfer.user_id,
      action: 'TRANSFER_COMPLETED',
      description: `Transfer ${bridgeTransferId} completado — $${transfer.amount}`,
    });
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: transfer.failed (REFACTORIZADO)
  //  Libera reserved_amount + notifica
  // ═══════════════════════════════════════════════

  private async handleTransferFailed(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = (payload?.event_object || payload?.data) as Record<string, unknown>;
    const bridgeTransferId = data?.id as string;
    if (!bridgeTransferId) throw new Error('transfer.failed sin transfer ID');

    // 1. UPDATE bridge_transfers
    const { data: transfer } = await this.supabase
      .from('bridge_transfers')
      .update({
        bridge_state: 'failed',
        status: 'failed',
        bridge_raw_response: data,
        updated_at: new Date().toISOString(),
      })
      .eq('bridge_transfer_id', bridgeTransferId)
      .select('id, user_id, payout_request_id, amount, destination_currency')
      .single();

    if (!transfer)
      throw new Error(`Bridge transfer no encontrada: ${bridgeTransferId}`);

    // 2. UPDATE payout_requests
    let payoutAmount = parseFloat(transfer.amount ?? '0');
    let currency = transfer.destination_currency ?? 'USD';

    if (transfer.payout_request_id) {
      const { data: payout } = await this.supabase
        .from('payout_requests')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.payout_request_id)
        .select('amount, fee_amount, currency')
        .single();

      if (payout) {
        payoutAmount =
          parseFloat(payout.amount) + parseFloat(payout.fee_amount ?? '0');
        currency = payout.currency;
      }
    }

    // 3. UPDATE ledger_entry: pending → failed (NO dispara trigger de balance)
    await this.supabase
      .from('ledger_entries')
      .update({ status: 'failed' })
      .eq('bridge_transfer_id', transfer.id)
      .eq('status', 'pending');

    // 4. Liberar saldo reservado
    await this.supabase.rpc('release_reserved_balance', {
      p_user_id: transfer.user_id,
      p_currency: currency.toUpperCase(),
      p_amount: payoutAmount,
    });

    // 4b. UPDATE payment_orders (si el transfer está vinculado a una order)
    const { data: failedOrder } = await this.supabase
      .from('payment_orders')
      .select('id, user_id, wallet_id, amount, fee_amount, currency')
      .eq('bridge_transfer_id', bridgeTransferId)
      .in('status', ['processing', 'created'])
      .maybeSingle();

    if (failedOrder) {
      await this.supabase
        .from('payment_orders')
        .update({
          status: 'failed',
          failure_reason: `Bridge transfer ${bridgeTransferId} falló`,
        })
        .eq('id', failedOrder.id);

      // Liberar balance reservado de la payment_order
      const orderTotal =
        parseFloat(failedOrder.amount ?? '0') +
        parseFloat(failedOrder.fee_amount ?? '0');
      if (orderTotal > 0) {
        await this.supabase.rpc('release_reserved_balance', {
          p_user_id: failedOrder.user_id,
          p_currency: (failedOrder.currency ?? 'USDC').toUpperCase(),
          p_amount: orderTotal,
        });
      }

      // Marcar ledger entries como failed
      await this.supabase
        .from('ledger_entries')
        .update({ status: 'failed' })
        .eq('reference_type', 'payment_order')
        .eq('reference_id', failedOrder.id)
        .eq('status', 'pending');

      this.logger.warn(
        `❌ Payment order ${failedOrder.id} falló vía webhook (transfer ${bridgeTransferId})`,
      );
    }

    // 5. Notificación
    await this.supabase.from('notifications').insert({
      user_id: transfer.user_id,
      type: 'alert',
      title: 'Pago Fallido',
      message: `Tu pago de $${transfer.amount} falló. El saldo ha sido devuelto a tu cuenta.`,
      reference_type: 'bridge_transfer',
      reference_id: transfer.id,
    });

    // 6. Activity log
    await this.supabase.from('activity_logs').insert({
      user_id: transfer.user_id,
      action: 'TRANSFER_FAILED',
      description: `Transfer ${bridgeTransferId} falló — saldo liberado`,
    });
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: kyc_link.approved (REFACTORIZADO)
  //  [GAP 2 FIX] Mismo evento para KYC y KYB
  // ═══════════════════════════════════════════════

  private async handleKycApproved(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    const kycLinkId = data?.id as string;
    if (!kycLinkId) throw new Error('kyc_link.approved sin link ID');

    // [GAP 2 FIX] Determinar tipo por customer.type
    const customer = data?.customer as Record<string, unknown> | undefined;
    const customerType = (customer?.type as string) ?? 'individual';
    const bridgeCustomerId = (customer?.id as string) ?? null;

    // Buscar en bridge_kyc_links
    const { data: link } = await this.supabase
      .from('bridge_kyc_links')
      .select('user_id')
      .eq('bridge_kyc_link_id', kycLinkId)
      .single();

    if (!link) throw new Error(`Bridge KYC link no encontrado: ${kycLinkId}`);
    const userId = link.user_id;

    // Actualizar bridge_kyc_links
    await this.supabase
      .from('bridge_kyc_links')
      .update({
        status: 'approved',
        bridge_customer_id: bridgeCustomerId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('bridge_kyc_link_id', kycLinkId);

    // [GAP 2 FIX] Actualizar la aplicación correcta según tipo
    if (customerType === 'business') {
      await this.supabase
        .from('kyb_applications')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('status', ['submitted', 'under_review']);
    } else {
      await this.supabase
        .from('kyc_applications')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('status', ['submitted', 'under_review']);
    }

    // Actualizar perfil
    await this.supabase
      .from('profiles')
      .update({
        onboarding_status: 'approved',
        bridge_customer_id: bridgeCustomerId,
      })
      .eq('id', userId);

    // Inicializar wallets y balances vía Bridge API
    await this.initializeWalletsForUser(userId, bridgeCustomerId);

    // Notificación
    const typeLabel = customerType === 'business' ? 'KYB' : 'KYC';
    await this.supabase.from('notifications').insert({
      user_id: userId,
      type: 'onboarding',
      title: `Verificación ${typeLabel} Aprobada`,
      message: `Tu verificación ${typeLabel} ha sido aprobada. Ya puedes operar en la plataforma.`,
    });

    // Activity log
    await this.supabase.from('activity_logs').insert({
      user_id: userId,
      action: `${typeLabel}_APPROVED`,
      description: `Verificación ${typeLabel} aprobada por Bridge — customer: ${bridgeCustomerId}`,
    });
  }

  // ═══════════════════════════════════════════════
  //  HANDLER: liquidation_address.payment_completed
  // ═══════════════════════════════════════════════

  private async handleLiquidationPayment(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = payload?.data as Record<string, unknown>;
    const addressId = data?.liquidation_address_id as string;
    const amount = parseFloat((data?.amount as string) ?? '0');
    if (!addressId || !amount) throw new Error('liquidation payment sin datos');

    // Buscar dirección — columna correcta
    const { data: addr } = await this.supabase
      .from('bridge_liquidation_addresses')
      .select('id, user_id, destination_currency')
      .eq('bridge_liquidation_address_id', addressId)
      .single();

    if (!addr)
      throw new Error(`Liquidation address no encontrada: ${addressId}`);

    // Obtener wallet
    const { data: wallet } = await this.supabase
      .from('wallets')
      .select('id')
      .eq('user_id', addr.user_id)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!wallet)
      throw new Error(`Wallet no encontrada para user ${addr.user_id}`);

    // INSERT ledger_entry (credit, settled)
    await this.supabase.from('ledger_entries').insert({
      wallet_id: wallet.id,
      type: 'credit',
      amount,
      currency: addr.destination_currency ?? 'usd',
      description: `Liquidación crypto recibida — $${amount}`,
      reference_type: 'liquidation_address',
      reference_id: addr.id,
      status: 'settled',
    });

    // Notificación
    await this.supabase.from('notifications').insert({
      user_id: addr.user_id,
      type: 'financial',
      title: 'Liquidación Recibida',
      message: `Recibiste $${amount.toFixed(2)} de liquidación crypto`,
      reference_type: 'liquidation_address',
      reference_id: addr.id,
    });
  }

  // ═══════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════

  /**
   * Verifica la firma Bridge de un webhook.
   *
   * Formato del header X-Webhook-Signature:
   *   t=<unix_timestamp>,v0=<base64_encoded_signature>
   *
   * Algoritmo de verificación (Bridge docs):
   *   1. Extraer timestamp (t) y firma base64 (v0) del header
   *   2. Rechazar si el evento tiene más de 10 minutos (anti-replay)
   *   3. Construir el mensaje: `<timestamp>.<rawBody>`
   *   4. Generar digest SHA256 del mensaje
   *   5. Verificar la firma RSA con la public_key del webhook
   *
   * @param rawBody - Buffer con el body exactamente como llegó de Bridge
   * @param signatureHeader - Valor del header X-Webhook-Signature
   */
  private verifyBridgeSignature(
    rawBody: Buffer,
    signatureHeader: string | null,
  ): boolean {
    const publicKey = this.config.get<string>('app.bridgeWebhookPublicKey');
    if (!publicKey || !signatureHeader) return false;

    try {
      // Parsear el header: t=<timestamp>,v0=<base64sig>
      const parts = Object.fromEntries(
        signatureHeader.split(',').map((part) => {
          const [k, ...v] = part.split('=');
          return [k.trim(), v.join('=').trim()];
        }),
      );

      const timestamp = parts['t'];
      const signatureB64 = parts['v0'];

      if (!timestamp || !signatureB64) {
        this.logger.warn('Firma Bridge malformada: faltan campos t o v0');
        return false;
      }

      // Anti-replay: rechazar eventos de más de 10 minutos
      const eventAge = Date.now() / 1000 - parseInt(timestamp, 10);
      if (eventAge > 600) {
        this.logger.warn(
          `Evento Bridge demasiado antiguo (${Math.round(eventAge)}s) — posible replay attack`,
        );
        return false;
      }

      // Construir el mensaje que Bridge firmó: "<timestamp>.<rawBody>"
      const message = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);

      // Generar digest SHA256 del mensaje
      const digest = crypto.createHash('sha256').update(message).digest();

      // Verificar firma RSA con la public_key del webhook
      const signatureBuf = Buffer.from(signatureB64, 'base64');
      const normalizedKey = publicKey.replace(/\\n/g, '\n');

      const result = crypto.verify(
        'RSA-SHA256',
        digest,
        { key: normalizedKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        signatureBuf,
      );

      return result;
    } catch (e) {
      this.logger.error(`Error verificando firma Bridge: ${e}`);
      return false;
    }
  }

  /**
   * Inicializa wallets de un cliente recién aprobado vía Bridge API.
   *
   * Según la documentación de Bridge:
   * - Endpoint: POST /v0/customers/{customerID}/wallets
   * - Body requerido: { chain } (enum: base, ethereum, solana, tempo, tron)
   * - Header requerido: Idempotency-Key
   * - Respuesta: { id, chain, address, created_at, updated_at }
   */
  private async initializeWalletsForUser(
    userId: string,
    bridgeCustomerId: string | null,
  ): Promise<void> {
    try {
      // Leer config de wallets
      const { data: setting } = await this.supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'SUPPORTED_WALLET_CONFIGS')
        .single();

      const configs: Array<{ currency: string; network: string }> = JSON.parse(
        setting?.value ?? '[{"currency":"usdc","network":"ethereum"}]',
      );

      for (const wc of configs) {
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

        // Llamar Bridge API para crear wallet real
        let walletAddress: string | null = null;
        let providerWalletId: string | null = null;

        if (bridgeCustomerId && this.bridgeApi.isConfigured) {
          try {
            const idempotencyKey = `wallet-${bridgeCustomerId}-${wc.network}-${Date.now()}`;
            const bridgeWallet = await this.bridgeApi.post<{
              id: string;
              chain: string;
              address: string;
              created_at: string;
              updated_at: string;
            }>(
              `/v0/customers/${bridgeCustomerId}/wallets`,
              { chain: wc.network },
              idempotencyKey,
            );
            walletAddress = bridgeWallet.address;
            providerWalletId = bridgeWallet.id;
          } catch (walletErr) {
            this.logger.error(
              `Error creando Bridge wallet (${wc.network}) para user ${userId}: ${walletErr}`,
            );
            // Continuar con la siguiente wallet — no bloquear todo el flujo
            continue;
          }
        } else {
          this.logger.warn(
            `Bridge API no disponible para user ${userId} — wallet ${wc.network} no creada`,
          );
          continue;
        }

        // Guardar en DB con datos reales de Bridge
        await this.supabase.from('wallets').insert({
          user_id: userId,
          currency: wc.currency.toUpperCase(),
          address: walletAddress,
          network: wc.network,
          provider_key: 'bridge',
          provider_wallet_id: providerWalletId,
          label: `${wc.currency.toUpperCase()} (${wc.network})`,
          is_active: true,
        });
      }

      // Inicializar balances (siempre incluir USD como fiat base)
      const currencies = [
        ...new Set([...configs.map((c) => c.currency.toUpperCase()), 'USD']),
      ];
      for (const currency of currencies) {
        const { data: existing } = await this.supabase
          .from('balances')
          .select('id')
          .eq('user_id', userId)
          .eq('currency', currency)
          .maybeSingle();

        if (!existing) {
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

      this.logger.log(
        `Wallets inicializadas para user ${userId}: ${configs.length} configuraciones`,
      );
    } catch (err) {
      this.logger.error(`Error inicializando wallets para ${userId}: ${err}`);
    }
  }

  private async notifyAdminWebhookFailed(
    webhookId: string,
    eventType: string,
    error: string,
  ): Promise<void> {
    // Buscar admin users
    const { data: admins } = await this.supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super_admin'])
      .eq('is_active', true)
      .limit(5);

    if (!admins?.length) return;

    const notifications = admins.map((admin) => ({
      user_id: admin.id,
      type: 'system',
      title: '⚠️ Webhook Fallido (5 reintentos)',
      message: `Evento ${eventType} (${webhookId}) falló 5 veces: ${error.slice(0, 200)}`,
      reference_type: 'webhook_event',
      reference_id: webhookId,
    }));

    await this.supabase.from('notifications').insert(notifications);
  }
}
