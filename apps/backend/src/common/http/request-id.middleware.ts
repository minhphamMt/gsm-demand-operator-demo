import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const requestIdHeader = 'x-request-id';
export const idempotencyKeyHeader = 'x-idempotency-key';

export type RequestWithId = Request & { requestId: string; idempotencyKey: string };

const validRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction) {
  const incoming = request.header(requestIdHeader);
  const requestId = incoming && validRequestId.test(incoming) ? incoming : randomUUID();
  const incomingIdempotencyKey = request.header(idempotencyKeyHeader);
  const idempotencyKey = incomingIdempotencyKey && validRequestId.test(incomingIdempotencyKey)
    ? incomingIdempotencyKey
    : requestId;
  (request as RequestWithId).requestId = requestId;
  (request as RequestWithId).idempotencyKey = idempotencyKey;
  response.setHeader(requestIdHeader, requestId);
  next();
}
