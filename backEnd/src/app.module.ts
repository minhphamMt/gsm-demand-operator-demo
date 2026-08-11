import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { OperatorModule } from './operator/operator.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'sensitive', ttl: 60_000, limit: 10, blockDuration: 60_000 },
    ]),
    SupabaseModule,
    AuthModule,
    HealthModule,
    OperatorModule,
  ],
})
export class AppModule {}
