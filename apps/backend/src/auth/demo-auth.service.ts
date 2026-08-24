import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase/supabase.service';

type DemoSessionResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number | null;
  token_type: string;
  user: { id: string; email: string | null };
};

@Injectable()
export class DemoAuthService {
  private readonly logger = new Logger(DemoAuthService.name);
  private readonly client: SupabaseClient | undefined;
  private readonly email: string | undefined;
  private readonly password: string | undefined;

  constructor(
    config: ConfigService,
    private readonly db: SupabaseService,
  ) {
    const url = config.get<string>('SUPABASE_URL');
    const publishableKey = config.get<string>('SUPABASE_PUBLISHABLE_KEY');
    this.email = config.get<string>('DEMO_OPERATOR_EMAIL')?.trim() || undefined;
    this.password = config.get<string>('DEMO_OPERATOR_PASSWORD') || undefined;
    if (url && publishableKey) {
      this.client = createClient(url, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
    }
  }

  async createSession(): Promise<DemoSessionResponse> {
    if (!this.client || !this.email || !this.password) {
      throw new UnauthorizedException('Demo access is disabled');
    }

    const { data, error } = await this.client.auth.signInWithPassword({ email: this.email, password: this.password });
    if (error || !data.session || !data.user) {
      this.logger.warn(JSON.stringify({ event: 'demo_auth_failed', email: this.email, code: error?.status ?? 'unknown' }));
      throw new UnauthorizedException('Demo access is unavailable');
    }

    const { data: profile, error: profileError } = await this.db.client
      .from('profiles')
      .select('role,is_active')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError || profile?.role !== 'OPERATOR' || profile.is_active !== true) {
      throw new ForbiddenException('The configured demo account is not an active operator');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at ?? null,
      token_type: data.session.token_type,
      user: { id: data.user.id, email: data.user.email ?? null },
    };
  }
}
