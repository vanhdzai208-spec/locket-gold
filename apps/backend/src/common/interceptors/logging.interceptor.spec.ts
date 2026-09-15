import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  it('should strip query strings and tokens from request URL when logging', (done) => {
    const mockRequest = {
      method: 'GET',
      originalUrl:
        '/locket/proxy-image?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Ffile.jpg&token=secret-token-12345',
      url: '/locket/proxy-image?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Ffile.jpg&token=secret-token-12345',
    };
    const mockResponse = {
      statusCode: 200,
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of({ success: true }),
    };

    const loggerSpy = jest
      .spyOn((interceptor as any).logger, 'log')
      .mockImplementation();

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: () => {
        expect(loggerSpy).toHaveBeenCalled();
        const logMessage = loggerSpy.mock.calls[0][0];
        expect(logMessage).toContain('GET /locket/proxy-image 200');
        expect(logMessage).not.toContain('secret-token-12345');
        expect(logMessage).not.toContain('?url=');
        done();
      },
      error: (err) => done(err),
    });
  });
});
