// src/main.ts
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  // Habilitar cierre limpio (Graceful Shutdown)
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`🚀 Guira API running on http://localhost:${port}/${prefix}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/${prefix}/docs`);
}
bootstrap();
