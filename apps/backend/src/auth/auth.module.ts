import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { DemoAuthService } from './demo-auth.service';
import { ActorThrottlerGuard } from '../common/security/actor-throttler.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, DemoAuthService, ActorThrottlerGuard, { provide: APP_GUARD, useExisting: AuthGuard }],
})
export class AuthModule {}
