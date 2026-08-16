import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

import { AuthGuard } from './auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

type GuardFixture = {
  guard: AuthGuard;
  getUser: jest.Mock;
  profile: jest.Mock;
};

function fixture(): GuardFixture {
  const getUser = jest.fn();
  const profile = jest.fn();
  const db = new SupabaseService(new ConfigService({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  }));
  Object.defineProperty(db, 'client', { value: {
    auth: { getUser },
    from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: profile })) })) })),
  } });
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
  return { guard: new AuthGuard(reflector, db), getUser, profile };
}

function context() {
  const host = new ExecutionContextHost([{
    headers: { authorization: 'Bearer valid-token' },
  }]);
  host.setType('http');
  return host;
}

describe('AuthGuard failure contract', () => {
  it('returns 401 only for a rejected access token', async () => {
    const { guard, getUser } = fixture();
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 503 when the authentication provider is unavailable', async () => {
    const { guard, getUser } = fixture();
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 0, message: 'fetch failed' } });

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns 503 when the profile lookup cannot reach the database', async () => {
    const { guard, getUser, profile } = fixture();
    getUser.mockResolvedValue({ data: { user: { id: 'operator-1', email: 'operator@test.local' } }, error: null });
    profile.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns 403 for an inactive profile', async () => {
    const { guard, getUser, profile } = fixture();
    getUser.mockResolvedValue({ data: { user: { id: 'operator-1', email: 'operator@test.local' } }, error: null });
    profile.mockResolvedValue({ data: { role: 'OPERATOR', is_active: false }, error: null });

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
