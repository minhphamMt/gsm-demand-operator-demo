import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const requestIdHeader = 'x-request-id';

export type RequestWithId = Request & { requestId: string };

const validRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction) {
  const incoming = request.header(requestIdHeader);
  const requestId = incoming && validRequestId.test(incoming) ? incoming : randomUUID();
  (request as RequestWithId).requestId = requestId;
  response.setHeader(requestIdHeader, requestId);
  next();
}
