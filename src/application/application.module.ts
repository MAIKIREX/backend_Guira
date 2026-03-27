import { Module } from '@nestjs/common';
import { ProfilesModule } from './profiles/profiles.module';
import { WalletsModule } from './wallets/wallets.module';
import { ComplianceModule } from './compliance/compliance.module';
import { BridgeModule } from './bridge/bridge.module';
import { WebhooksModule } from './webhooks/webhooks.module';

/**
 * ApplicationModule agrupa todos los módulos de negocio de Guira.
 * Todos los servicios tienen acceso al SupabaseModule via @Global().
 */
@Module({
  imports: [
    ProfilesModule,
    WalletsModule,
    ComplianceModule,
    BridgeModule,
    WebhooksModule,
  ],
})
export class ApplicationModule {}
