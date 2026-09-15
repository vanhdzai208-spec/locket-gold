import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred. Please try again later.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = this.mapStatusToCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const anyRes = res as any;
        code = anyRes.code || this.mapStatusToCode(status);
        if (Array.isArray(anyRes.message)) {
          message = anyRes.message.join(', ');
        } else {
          message = anyRes.message || message;
        }
      }
    } else if (exception instanceof Error) {
      // Map known custom or external error names
      message = this.mapErrorMessage(exception.message);
      code = this.extractErrorCode(exception.message);
      if (
        code === 'EMAIL_NOT_FOUND' ||
        code === 'INVALID_PASSWORD' ||
        code === 'INVALID_LOGIN_CREDENTIALS' ||
        code === 'USER_DISABLED' ||
        code === 'UNAUTHORIZED' ||
        code === 'TOKEN_EXPIRED'
      ) {
        status = HttpStatus.UNAUTHORIZED;
      } else if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        status = HttpStatus.TOO_MANY_REQUESTS;
      } else if (code === 'INVALID_INPUT' || code === 'INVALID_IMAGE') {
        status = HttpStatus.BAD_REQUEST;
      }
    }

    // Secure logging: server logs original internal error details and stack trace
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const originalErr = exception instanceof Error ? exception.message : message;
      this.logger.error(
        `[${code}] Status: ${status} - Server detail: ${originalErr}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status === HttpStatus.UNAUTHORIZED) {
      this.logger.debug(`[${code}] Auth check: ${message}`);
    } else {
      this.logger.warn(`[${code}] Status: ${status} - Message: ${message}`);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return 'FILE_TOO_LARGE';
      default:
        return 'INTERNAL_ERROR';
    }
  }

  private extractErrorCode(raw: string): string {
    if (raw.includes('EMAIL_NOT_FOUND')) return 'EMAIL_NOT_FOUND';
    if (raw.includes('INVALID_PASSWORD')) return 'INVALID_PASSWORD';
    if (raw.includes('INVALID_LOGIN_CREDENTIALS')) return 'INVALID_PASSWORD';
    if (raw.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'TOO_MANY_ATTEMPTS_TRY_LATER';
    if (raw.includes('USER_DISABLED')) return 'USER_DISABLED';
    if (raw.includes('TOKEN_EXPIRED') || raw.includes('INVALID_REFRESH_TOKEN'))
      return 'TOKEN_EXPIRED';
    if (raw.includes('STORAGE_FAILED')) return 'STORAGE_FAILED';
    if (raw.includes('LOCKET_API_FAILED')) return 'LOCKET_API_FAILED';
    if (raw.includes('INVALID_IMAGE')) return 'INVALID_IMAGE';
    return 'UNKNOWN_ERROR';
  }

  private mapErrorMessage(raw: string): string {
    if (raw.includes('EMAIL_NOT_FOUND')) {
      return 'No Locket account found with this email address.';
    }
    if (raw.includes('INVALID_PASSWORD') || raw.includes('INVALID_LOGIN_CREDENTIALS')) {
      return 'Incorrect password. Please verify your Locket credentials.';
    }
    if (raw.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
      return 'Too many failed login attempts. Please wait a few minutes before trying again.';
    }
    if (raw.includes('USER_DISABLED')) {
      return 'This Locket account has been disabled by the platform.';
    }
    if (raw.includes('INVALID_REFRESH_TOKEN') || raw.includes('TOKEN_EXPIRED')) {
      return 'Your session has expired. Please sign in again.';
    }
    if (raw.includes('INVALID_IMAGE')) {
      return 'The uploaded image format or data is invalid. Please select a valid JPEG, PNG, or WebP image.';
    }
    if (raw.includes('FILE_TOO_LARGE')) {
      return 'Image file size exceeds the allowed limit (max 4MB).';
    }
    if (raw.includes('STORAGE_FAILED')) {
      return 'Failed to upload image to storage. Please try again.';
    }
    if (raw.includes('LOCKET_API_FAILED')) {
      return 'Locket service communication failed. Please try again.';
    }
    // Security (SEC-02): Never leak raw exception messages (DB, stack, internal IP) to client
    return 'An unexpected error occurred. Please try again later.';
  }
}
