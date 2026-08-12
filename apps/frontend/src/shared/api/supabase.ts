import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/shared/config/env'

let client: SupabaseClient | undefined

export function getSupabaseClient() {
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error('Supabase browser configuration is unavailable')
  }
  client ??= createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
  })
  return client
}
