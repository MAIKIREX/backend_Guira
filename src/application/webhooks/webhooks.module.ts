import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { BridgeModule } from '../bridge/bridge.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [BridgeModule, WalletsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
