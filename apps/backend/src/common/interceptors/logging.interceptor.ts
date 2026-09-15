import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const method = req.method;
    // Security (SEC-01): Strip query string to prevent leaking tokens (e.g. Firebase storage download tokens)
    const rawUrl = req.originalUrl || req.url || '';
    const cleanUrl = rawUrl.split('?')[0] || '/';
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        // Never log body, headers (Authorization/Cookie), or query parameters containing tokens
        this.logger.log(`${method} ${cleanUrl} ${statusCode} - ${duration}ms`);
      }),
    );
  }
}
