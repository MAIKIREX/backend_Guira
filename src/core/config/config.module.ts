import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import appConfig from './app/app.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.local',
      load: [appConfig],
      expandVariables: true,
      validationSchema: Joi.object({
        // App
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        PORT: Joi.number().default(3001),
        PATH_SUBDOMAIN: Joi.string().default('api'),
        URL_FRONTEND: Joi.string().allow('').default(''),

        // Supabase
        SUPABASE_URL: Joi.string().uri().required(),
        SUPABASE_ANON_KEY: Joi.string().required(),
        SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),

        // Bridge API
        BRIDGE_API_KEY: Joi.string().allow('').default(''),
        BRIDGE_API_URL: Joi.string().uri().allow('').default(''),
        BRIDGE_WEBHOOK_PUBLIC_KEY: Joi.string().allow('').default(''),
      }),
    }),
  ],
  exports: [NestConfigModule],
})
export class CoreConfigModule {}