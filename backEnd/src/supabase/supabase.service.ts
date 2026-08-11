import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, PostgrestError, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor(config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  unwrap<T>(data: T | null, error: PostgrestError | null): T {
    if (error) {
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      if (error.code === '23505') throw new ConflictException(error.message);
      if (error.code === '23514' && /Proposal (cannot be revised|was already reviewed)/i.test(error.message)) {
        throw new ConflictException({
          code: 'PROPOSAL_VERSION_CONFLICT',
          message: 'Proposal was changed by another operator.',
        });
      }
      if (error.code === '23514' || error.code === '22023') {
        throw new UnprocessableEntityException(error.message);
      }
      if (error.code === '42501') throw new ForbiddenException('Database operation is not permitted');
      throw new ServiceUnavailableException({
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
      });
    }
    if (data === null) throw new ServiceUnavailableException('Database returned no data');
    return data;
  }
}
