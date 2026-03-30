import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CoreConfigModule } from './config/config.module';
import { SupabaseModule } from './supabase/supabase.module';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Module({
  imports: [
    CoreConfigModule,       // Variables de entorno + validación Joi
    SupabaseModule,         // Cliente Supabase (service_role) — global
    ScheduleModule.forRoot(), // CRON jobs con @nestjs/schedule
    ThrottlerModule.forRoot([{
      ttl: 60000, 
      limit: 100, // global limit 100 req per minute
    }]),
  ],
  providers: [
    // Guard global: protección contra DdoS/Abuso rate limit
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Guard global: todas las rutas requieren autenticación
    // a menos que usen el decorador @Public()
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
})
export class CoreModule {}