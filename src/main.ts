// src/main.ts
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';

import helmet from 'helmet';

async function bootstrap() {
  // IMPORTANTE: Habilitamos rawBody para poder verificar firmas RSA/SHA256
  // de Bridge Webhooks sin interferir con FileInterceptor (Multer) o uploads.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Prefijo global de la API
  const prefix = process.env.PATH_SUBDOMAIN || 'api';
  app.setGlobalPrefix(prefix);

  // CORS: acepta orígenes definidos en URL_FRONTEND (comma-separated) y localhost para desarrollo
  const allowedOrigins = (process.env.URL_FRONTEND ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => o.length > 0);

  // Siempre permitir localhost para desarrollo
  if (!allowedOrigins.includes('http://localhost:3000')) {
    allowedOrigins.push('http://localhost:3000');
  }
  if (!allowedOrigins.includes('http://localhost:5173')) {
    allowedOrigins.push('http://localhost:5173');
  }

  console.log('🔒 CORS allowed origins:', allowedOrigins);

  // IMPORTANTE: enableCors ANTES de helmet para que las respuestas preflight (OPTIONS)
  // se envíen correctamente sin ser bloqueadas por helmet
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  });

  // Security Headers — crossOriginResourcePolicy false para no bloquear peticiones cross-origin a la API
  app.use(helmet({ crossOriginResourcePolicy: false }));

  // Validación/transformación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Swagger — accesible en /{prefix}/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Guira API')
    .setDescription('API de la plataforma financiera Guira')
    .setVersion('2.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Token JWT de Supabase Auth (Authorization: Bearer <token>)',
      },
      'supabase-jwt',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    useGlobalPrefix: true,
    swaggerOptions: { persistAuthorization: true },
    jsonDocumentUrl: 'swagger/json',
  });

  // Render inyecta PORT automáticamente; default 3000 para producción
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  // Habilitar cierre limpio (Graceful Shutdown)
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`🚀 Guira API running on http://localhost:${port}/${prefix}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/${prefix}/docs`);
}
bootstrap();
