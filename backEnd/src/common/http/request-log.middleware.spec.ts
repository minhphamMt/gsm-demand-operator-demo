import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import { requestLogMiddleware } from './request-log.middleware';
import type { RequestWithId } from './request-id.middleware';

describe('requestLogMiddleware', () => {
  it('logs completion with the request id', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    let finish: (() => void) | undefined;
    const response = {
      on: jest.fn((_event: string, listener: () => void) => { finish = listener; }),
      statusCode: 200,
    } as unknown as Response;
    const request = {
      method: 'GET',
      path: '/api/v1/operator/proposals',
      requestId: 'operator-request-42',
    } as RequestWithId;
    const next = jest.fn() as NextFunction;

    requestLogMiddleware(request, response, next);
    finish?.();

    expect(next).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(log.mock.calls[0][0]));
    expect(payload).toMatchObject({ event: 'http_request_completed', requestId: 'operator-request-42', status: 200 });
  });
});
