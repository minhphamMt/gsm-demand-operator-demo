import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { requestLogMiddleware } from './common/http/request-log.middleware';
import { requestIdMiddleware } from './common/http/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowLocalDevelopmentOrigin = (requestOrigin: string) =>
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(requestOrigin);
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !requestOrigin ||
        origins.includes(requestOrigin) ||
        allowLocalDevelopmentOrigin(requestOrigin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: true,
  });

  const swagger = new DocumentBuilder()
    .setTitle('GSM Backend')
    .setDescription(
      'Supply-demand balancing API. Money values are integer VND. Date-time values are ISO-8601 with timezone. Errors use { code, message, details?, requestId }.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
