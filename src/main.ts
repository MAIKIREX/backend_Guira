// src/main.ts
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';

import helmet from 'helmet';

async function bootstrap() {
  // IMPORTANTE: Deshabilitar el body parser por defecto de NestJS para poder
  // capturar el raw body antes de que Express lo parsee.
  // Esto es REQUERIDO para la verificación de firmas RSA/SHA256 de Bridge Webhooks.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ─── Raw body middleware (DEBE ir ANTES de cualquier otro middleware) ─────────
  // Captura el buffer crudo de la petición y lo almacena en req['rawBody'].
  // Luego parsea el JSON normalmente para el resto de la app.
  // El webhook service usa rawBody para verificar la firma de Bridge (SHA256/RSA).
  app.use((req: Request, res: Response, next: NextFunction) => {
    let data = Buffer.alloc(0);

    req.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
    });

    req.on('end', () => {
      // Guardar raw buffer en la request para uso del webhook service
      (req as Request & { rawBody?: Buffer }).rawBody = data;

      const contentType = req.headers['content-type'] ?? '';

      if (contentType.includes('application/json')) {
        try {
          req.body = JSON.parse(data.toString('utf-8'));
        } catch {
          req.body = {};
        }
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(data.toString('utf-8'));
        req.body = Object.fromEntries(params.entries());
      } else {
        req.body = data;
      }

      next();
    });

    req.on('error', next);
  });
  // ────────────────────────────────────────────────────────────────────────────

  // Prefijo global de la API
  const prefix = process.env.PATH_SUBDOMAIN || 'api';
  app.setGlobalPrefix(prefix);

  // Security Headers
  app.use(helmet());

  // CORS: acepta orígenes definidos en URL_FRONTEND (comma-separated)
  const allowedOrigins = (process.env.URL_FRONTEND ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => o.length > 0);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });

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
        description: 'Token JWT de Supabase Auth (Authorization: Bearer <token>)',
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
