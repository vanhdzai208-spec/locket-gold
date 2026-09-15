import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should sanitize raw internal exceptions (SEC-02) and not leak stack/IP to client', () => {
    const rawError = new Error('connect ECONNREFUSED 10.14.0.1:5432 - database timeout at pg_connect');

    filter.catch(rawError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        },
      }),
    );
  });

  it('should map known business errors to friendly messages', () => {
    const authError = new Error('EMAIL_NOT_FOUND: User does not exist');

    filter.catch(authError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'EMAIL_NOT_FOUND',
          message: 'No Locket account found with this email address.',
        },
      }),
    );
  });

  it('should pass through HttpException message cleanly', () => {
    const httpError = new HttpException('Invalid request payload', HttpStatus.BAD_REQUEST);

    filter.catch(httpError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid request payload',
        },
      }),
    );
  });
});
