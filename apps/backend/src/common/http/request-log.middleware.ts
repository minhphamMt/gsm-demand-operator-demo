import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import type { RequestWithId } from './request-id.middleware';

const logger = new Logger('HttpRequest');

export function requestLogMiddleware(request: RequestWithId, response: Response, next: NextFunction) {
  const startedAt = Date.now();
  response.on('finish', () => {
    logger.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'http_request_completed',
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  next();
}
