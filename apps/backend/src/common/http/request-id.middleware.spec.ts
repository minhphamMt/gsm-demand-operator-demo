import type { NextFunction, Request, Response } from 'express';

import { requestIdHeader, requestIdMiddleware, type RequestWithId } from './request-id.middleware';

describe('requestIdMiddleware', () => {
  it('keeps a safe incoming request id', () => {
    const request = { header: jest.fn(() => 'operator-request-42') } as unknown as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(request, response, next);

    expect((request as RequestWithId).requestId).toBe('operator-request-42');
    expect(response.setHeader).toHaveBeenCalledWith(requestIdHeader, 'operator-request-42');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('replaces an unsafe request id', () => {
    const request = { header: jest.fn(() => 'not safe\nvalue') } as unknown as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;

    requestIdMiddleware(request, response, jest.fn());

    expect((request as RequestWithId).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
