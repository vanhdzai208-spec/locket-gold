import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionData, SessionService } from '../../session/session.service';

declare module 'express' {
  interface Request {
    session?: SessionData;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const session = this.sessionService.getSession(request);

    if (!session || !session.userId || !session.refreshToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'No active session. Please sign in.',
      });
    }

    request.session = session;
    return true;
  }
}
