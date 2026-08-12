import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiErrorDto } from '../http/api-error.dto';
import { ActorThrottlerGuard } from './actor-throttler.guard';

export function SensitiveMutation(limit = 10) {
  return applyDecorators(
    UseGuards(ActorThrottlerGuard),
    Throttle({ sensitive: { limit, ttl: 60_000, blockDuration: 60_000 } }),
    ApiTooManyRequestsResponse({
      description: `More than ${limit} attempts by the same authenticated actor and endpoint in 60 seconds.`,
      type: ApiErrorDto,
    }),
  );
}
