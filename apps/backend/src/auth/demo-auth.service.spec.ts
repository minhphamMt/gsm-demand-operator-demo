import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DemoAuthService } from './demo-auth.service';
import { SupabaseService } from '../supabase/supabase.service';

function fixture(env: Record<string, string>) {
  const config = new ConfigService(env);
  const db = new SupabaseService(new ConfigService({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  }));
  return new DemoAuthService(config, db);
}

describe('DemoAuthService production gate (issue #13)', () => {
  it('refuses to issue a session when NODE_ENV is production, even with valid credentials configured', async () => {
    const service = fixture({
      NODE_ENV: 'production',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      DEMO_OPERATOR_EMAIL: 'demo@example.com',
      DEMO_OPERATOR_PASSWORD: 'demo-password',
    });

    await expect(service.createSession()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('never calls Supabase sign-in when NODE_ENV is production', async () => {
    const service = fixture({
      NODE_ENV: 'production',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      DEMO_OPERATOR_EMAIL: 'demo@example.com',
      DEMO_OPERATOR_PASSWORD: 'demo-password',
    });
    const signInWithPassword = jest.fn();
    Object.defineProperty(service, 'client', { value: { auth: { signInWithPassword } } });

    await expect(service.createSession()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('still disables the endpoint outside production when credentials are not configured', async () => {
    const service = fixture({ NODE_ENV: 'test' });

    await expect(service.createSession()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falls back to a non-production default when NODE_ENV is not explicitly production', async () => {
    const service = fixture({});

    await expect(service.createSession()).rejects.toBeInstanceOf(UnauthorizedException);
    expect((service as unknown as { nodeEnv: string }).nodeEnv).not.toBe('production');
  });
});
