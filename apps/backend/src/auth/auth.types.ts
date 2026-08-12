import type { User } from '@supabase/supabase-js';

export type AppRole = 'OPERATOR' | 'DRIVER';

export type AuthenticatedUser = User & { appRole: AppRole };

declare module 'http' {
  interface IncomingMessage {
    user?: AuthenticatedUser;
  }
}
