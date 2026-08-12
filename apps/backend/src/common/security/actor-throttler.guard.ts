import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../auth/auth.types';

type RateLimitedRequest = Request & { user?: AuthenticatedUser };

export function rateLimitTracker(request: RateLimitedRequest) {
  return request.user?.id ?? request.ip ?? request.socket?.remoteAddress ?? 'unknown-client';
}

@Injectable()
export class ActorThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: RateLimitedRequest): Promise<string> {
    return rateLimitTracker(request);
  }
}
