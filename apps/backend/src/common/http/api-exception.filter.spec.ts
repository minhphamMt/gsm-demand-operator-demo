import { BadRequestException, HttpStatus, Logger, ServiceUnavailableException, type ArgumentsHost } from '@nestjs/common';

import { ApiExceptionFilter } from './api-exception.filter';

function hostFor(response: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'request-test-1' }),
      getResponse: () => response,
      getNext: jest.fn(),
    }),
  } as unknown as ArgumentsHost;
}

describe('ApiExceptionFilter', () => {
  it('returns validation issues in the stable error envelope', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    new ApiExceptionFilter().catch(
      new BadRequestException({ message: ['budgetLimit must not be less than 0'] }),
      hostFor(response),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu gửi lên không hợp lệ.',
      requestId: 'request-test-1',
      details: {
        fieldErrors: { budgetLimit: 'budgetLimit must not be less than 0' },
        issues: ['budgetLimit must not be less than 0'],
      },
    });
  });

  it('preserves structured safe field errors from domain validation', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const exception = new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: { fieldErrors: { budgetLimit: 'Hạn mức không đủ.' } },
    });

    new ApiExceptionFilter().catch(exception, hostFor(response));

    expect(response.json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      details: { fieldErrors: { budgetLimit: 'Hạn mức không đủ.' } },
      message: 'Dữ liệu gửi lên không hợp lệ.',
      requestId: 'request-test-1',
    });
  });

  it('hides unexpected internal error details', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    new ApiExceptionFilter().catch(new Error('database password leaked'), hostFor(response));

    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'Máy chủ không thể xử lý yêu cầu.',
      requestId: 'request-test-1',
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('database password leaked');
  });

  it('returns a stable retryable envelope for service degradation', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    new ApiExceptionFilter().catch(new ServiceUnavailableException('database unavailable'), hostFor(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(response.json).toHaveBeenCalledWith({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Dịch vụ tạm thời không sẵn sàng. Vui lòng thử lại sau.',
      requestId: 'request-test-1',
    });
  });
});
