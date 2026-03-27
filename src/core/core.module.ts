import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreConfigModule } from './config/config.module';
import { SupabaseModule } from './supabase/supabase.module';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Module({
  imports: [
    CoreConfigModule,       // Variables de entorno + validación Joi
    SupabaseModule,         // Cliente Supabase (service_role) — global
    ScheduleModule.forRoot(), // CRON jobs con @nestjs/schedule
  ],
  providers: [
    // Guard global: todas las rutas requieren autenticación
    // a menos que usen el decorador @Public()
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
})
export class CoreModule {}