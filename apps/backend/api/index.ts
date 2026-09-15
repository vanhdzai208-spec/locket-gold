import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';

let cachedServer: Express | null = null;

async function bootstrapServer(): Promise<Express> {
  if (cachedServer) {
    return cachedServer;
  }

  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    {
      logger: ['error', 'warn', 'log'],
    },
  );

  // Security Headers
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      noSniff: true,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // Allow CORS for all frontends or same-origin requests
  app.enableCors({
    origin: true,
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

  app.use((cookieParser as any)());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor());

  await app.init();
  cachedServer = expressApp;
  return cachedServer;
}

export default async function handler(req: any, res: any) {
  // Normalize request url: strip '/api' prefix if Vercel or rewrites attached it
  if (req.url?.startsWith('/api/')) {
    req.url = req.url.substring(4);
  } else if (req.url === '/api' || req.url === '/api/') {
    req.url = '/';
  }

  // If Vercel passed original path via headers, restore it cleanly
  const originalPath =
    req.headers['x-matched-path'] ||
    req.headers['x-invoke-path'] ||
    req.headers['x-vercel-matched-path'] ||
    req.headers['x-forwarded-uri'];

  if (originalPath && originalPath !== '/api' && originalPath !== '/api/') {
    req.url = originalPath.startsWith('/api/')
      ? originalPath.substring(4)
      : originalPath;
  }

  const server = await bootstrapServer();

  return new Promise<void>((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('close', () => resolve());
    res.on('error', (err: any) => reject(err));

    server(req, res, (err: any) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({
            statusCode: 500,
            message: err.message || 'Internal Server Error',
          });
        }
        return resolve();
      }
      if (!res.headersSent) {
        res.status(404).json({
          statusCode: 404,
          message: `Cannot ${req.method} ${req.url}`,
          url: req.url,
          matchedPath: req.headers['x-matched-path'] || null,
        });
      }
      resolve();
    });
  });
}
