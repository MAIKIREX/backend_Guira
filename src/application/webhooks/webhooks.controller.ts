import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../core/guards/supabase-auth.guard';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * Endpoint receptor de webhooks de Bridge.
   * Es PÚBLICO (no requiere JWT de usuario).
   * Guarda el payload crudo y responde 200 inmediatamente.
   * El procesamiento real lo hace el CRON worker.
   */
  @Public()
  @Throttle({ default: { limit: 1000, ttl: 60000 } }) // Permite ráfagas del proveedor (1000 / minuto)
  @Post('bridge')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receptor de webhooks Bridge (Webhook Sink)' })
  async receiveBridgeWebhook(
    @Req() req: Request,
    @Headers('x-bridge-signature') signature: string,
    @Headers('bridge-api-version') apiVersion: string,
  ) {
    const payload = req.body as Record<string, unknown>;
    const providerEventId = (payload?.id as string) ?? null;
    const eventType = (payload?.type as string) ?? 'unknown';

    this.logger.log(`📨 Bridge webhook recibido: ${eventType} (${providerEventId})`);

    await this.webhooksService.sinkEvent({
      provider: 'bridge',
      event_type: eventType,
      provider_event_id: providerEventId,
      raw_payload: payload,
      headers: {
        'x-bridge-signature': signature ?? null,
        'bridge-api-version': apiVersion ?? null,
      },
      bridge_api_version: apiVersion ?? null,
    });

    return { received: true };
  }
}
