import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DemoAuthService } from './demo-auth.service';
import { SupabaseService } from '../supabase/supabase.service';

function fixture(overrides: Record<string, string> = {}) {
  const config = new ConfigService({
    NODE_ENV: 'production',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    DEMO_AUTO_LOGIN_ENABLED: 'true',
    DEMO_OPERATOR_EMAIL: 'demo@example.com',
    DEMO_OPERATOR_PASSWORD: 'demo-password',
    ...overrides,
  });
  const db = new SupabaseService(new ConfigService({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  }));
  const profile = jest.fn().mockResolvedValue({ data: { role: 'OPERATOR', is_active: true }, error: null });
  Object.defineProperty(db, 'client', { value: {
    from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: profile })) })) })),
  } });
  const service = new DemoAuthService(config, db);
  const signInWithPassword = jest.fn().mockResolvedValue({
    data: {
      session: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        expires_at: 1_800_000_000,
        token_type: 'bearer',
      },
      user: { id: 'demo-operator', email: 'demo@example.com' },
    },
    error: null,
  });
  Object.defineProperty(service, 'client', { value: { auth: { signInWithPassword } } });
  return { service, signInWithPassword };
}

describe('DemoAuthService', () => {
  it('stays disabled unless the explicit auto-login flag is enabled', async () => {
    const { service, signInWithPassword } = fixture({ DEMO_AUTO_LOGIN_ENABLED: 'false' });

    await expect(service.createSession()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('issues a session only for the configured active operator', async () => {
    const { service, signInWithPassword } = fixture();

    await expect(service.createSession()).resolves.toMatchObject({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: { id: 'demo-operator' },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'demo@example.com', password: 'demo-password' });
  });

  it('rejects a configured account that is not an active operator', async () => {
    const { service } = fixture();
    const db = (service as unknown as { db: { client: { from: jest.Mock } } }).db;
    db.client.from.mockReturnValue({ select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: { role: 'DRIVER', is_active: true }, error: null }) })) })) });

    await expect(service.createSession()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
