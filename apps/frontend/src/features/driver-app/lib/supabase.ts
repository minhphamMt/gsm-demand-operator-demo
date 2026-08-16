import { getSupabaseClient } from '@/shared/api/supabase'

/**
 * Driver read/realtime operations reuse the application's singleton browser
 * client. Mutations that need service-role or a database transaction go through
 * the NestJS API instead.
 */
export const requireSupabase = getSupabaseClient
