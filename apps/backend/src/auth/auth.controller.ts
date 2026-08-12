import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';

import type { AuthenticatedUser } from './auth.types';
import { ApiErrorDto } from '../common/http/api-error.dto';
import { AuthMeResponseDto } from './dto/auth-response.dto';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
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
