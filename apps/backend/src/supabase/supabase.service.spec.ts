import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SupabaseService } from './supabase.service';

describe('SupabaseService workflow errors', () => {
  const service = new SupabaseService(new ConfigService({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  }));
  const postgrestError = (message: string) => ({
    code: '23514',
    details: '',
    hint: '',
    message,
    name: 'PostgrestError',
    toJSON: () => ({ code: '23514', details: '', hint: '', message, name: 'PostgrestError' }),
  });

  it('maps a concurrent proposal review state to a stable conflict', () => {
    expect(() => service.unwrap(null, postgrestError('Proposal was already reviewed'))).toThrow(ConflictException);

    try {
      service.unwrap(null, postgrestError('Proposal cannot be revised in its current state'));
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'PROPOSAL_VERSION_CONFLICT' });
    }
  });
});
