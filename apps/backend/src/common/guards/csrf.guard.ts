import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import {
  CsrfService,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '../services/csrf.service';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isSkipped = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isSkipped) {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const method = req.method ? req.method.toUpperCase() : 'GET';

    // Safe methods: automatically ensure CSRF cookie is present, then allow
    if (this.safeMethods.has(method)) {
      this.csrfService.attachCsrfCookie(req, res);
      return true;
    }

    // State-changing methods (POST, PUT, PATCH, DELETE)
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = (req.headers[CSRF_HEADER_NAME] ||
      req.headers['x-xsrf-token']) as string | undefined;

    const isValid = this.csrfService.verify(cookieToken, headerToken);
    if (!isValid) {
      throw new ForbiddenException(
        'Invalid or missing CSRF token. Please provide a valid X-CSRF-Token header matching the session cookie.',
      );
    }

    return true;
  }
}
