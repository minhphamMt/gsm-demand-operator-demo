import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import type { ApiErrorDto } from './api-error.dto';
import type { RequestWithId } from './request-id.middleware';

type NestErrorBody = {
  code?: unknown;
  details?: unknown;
  error?: unknown;
  message?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validationDetails(issues: string[] | undefined) {
  if (!issues?.length) return undefined;
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const [field] = issue.split(' ');
    if (field && !fieldErrors[field]) fieldErrors[field] = issue;
  }
  return { fieldErrors, issues };
}

const errorCodes: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const safeMessages: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Dữ liệu gửi lên không hợp lệ.',
  [HttpStatus.UNAUTHORIZED]: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  [HttpStatus.FORBIDDEN]: 'Bạn không có quyền thực hiện thao tác này.',
  [HttpStatus.NOT_FOUND]: 'Không tìm thấy dữ liệu được yêu cầu.',
  [HttpStatus.CONFLICT]: 'Dữ liệu đã thay đổi hoặc thao tác đã được thực hiện trước đó.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Trạng thái dữ liệu hiện tại không cho phép thao tác này.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Dịch vụ tạm thời không sẵn sàng. Vui lòng thử lại sau.',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const parsed = typeof raw === 'object' && raw !== null ? raw as NestErrorBody : undefined;
    const validationIssues = Array.isArray(parsed?.message)
      ? parsed.message.filter((issue): issue is string => typeof issue === 'string')
      : undefined;

    const providedCode = typeof parsed?.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(parsed.code)
      ? parsed.code
      : undefined;
    const providedDetails = status < 500 && isRecord(parsed?.details) ? parsed.details : undefined;
    const body: ApiErrorDto = {
      code: providedCode ?? (validationIssues?.length ? 'VALIDATION_ERROR' : errorCodes[status]) ?? 'INTERNAL_ERROR',
      message: safeMessages[status] ?? 'Máy chủ không thể xử lý yêu cầu.',
      requestId: request.requestId,
      ...(providedDetails
        ? { details: providedDetails }
        : validationIssues?.length
          ? { details: validationDetails(validationIssues) }
          : {}),
    };

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`requestId=${request.requestId} status=${status}`, stack);
    }
    response.status(status).json(body);
  }
}
