import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public } from './auth.decorators';
import type { AuthenticatedUser } from './auth.types';
import { ApiErrorDto } from '../common/http/api-error.dto';
import { ActorThrottlerGuard } from '../common/security/actor-throttler.guard';
import { AuthMeResponseDto } from './dto/auth-response.dto';
import { DemoAuthService } from './demo-auth.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly demoAuth: DemoAuthService) {}

  @Post('demo-session')
  @Public()
  @UseGuards(ActorThrottlerGuard)
  @Throttle({ sensitive: { limit: 5, ttl: 60_000, blockDuration: 60_000 } })
  @ApiOkResponse({ description: 'Short-lived session for the explicitly configured demo operator.' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  demoSession() {
    return this.demoAuth.createSession();
  }

  @Get('me')
  @ApiOkResponse({ type: AuthMeResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  @ApiForbiddenResponse({ type: ApiErrorDto })
  me(@Req() request: Request & { user: AuthenticatedUser }) {
    return {
      id: request.user.id,
      email: request.user.email ?? null,
      role: request.user.appRole,
    };
  }
}
