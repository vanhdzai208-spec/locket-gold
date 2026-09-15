import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

  // Security: Helmet for HTTP response security headers
  app.use(
    helmet({
      frameguard: { action: 'deny' }, // Anti-clickjacking
      noSniff: true, // X-Content-Type-Options: nosniff
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // Security: Restrict CORS origin strictly in production, allow localhost in development
  const allowedOrigins = isProd
    ? [frontendUrl]
    : Array.from(new Set([frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000']));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-CSRF-Token',
      'x-csrf-token',
    ],
  });

  // Cookie parser middleware for reading session and CSRF cookies
  app.use((cookieParser as any)());

  // Global request validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor());

  await app.listen(port);
  logger.log(`Locket Backend API is running on: http://localhost:${port}`);
  logger.log(`Allowed CORS Origin: ${frontendUrl}`);
}

bootstrap();
