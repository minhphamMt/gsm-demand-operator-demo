import { SupabaseService } from '../supabase/supabase.service';

const terminalCampaignStatuses = new Set([
  'BUDGET_EXHAUSTED',
  'CANCELLED',
  'COMPLETED',
]);

type DriverStateRow = {
  active_campaign_id: string | null;
  driver_id: string;
  is_online: boolean;
};

export async function releaseTerminalDriverState(db: SupabaseService, driverId: string) {
  const { data: state, error: stateError } = await db.client
    .from('driver_states')
    .select('driver_id,active_campaign_id,is_online')
    .eq('driver_id', driverId)
    .maybeSingle();
  if (stateError) db.unwrap(null, stateError);
  const driverState = state as DriverStateRow | null;
  if (!driverState?.active_campaign_id) return false;

  const { data: campaign, error: campaignError } = await db.client
    .from('campaigns')
    .select('status')
    .eq('id', driverState.active_campaign_id)
    .maybeSingle();
  if (campaignError) db.unwrap(null, campaignError);
  if (!campaign || !terminalCampaignStatuses.has(String(campaign.status))) return false;

  const { error: releaseError } = await db.client
    .from('driver_states')
    .update({
      active_campaign_id: null,
      operational_status: driverState.is_online ? 'IDLE' : 'OFFLINE',
      updated_at: new Date().toISOString(),
    })
    .eq('driver_id', driverId)
    .eq('active_campaign_id', driverState.active_campaign_id);
  if (releaseError) db.unwrap(null, releaseError);
  return true;
}

export async function releaseAllTerminalDriverStates(db: SupabaseService) {
  const { data, error } = await db.client
    .from('driver_states')
    .select('driver_id')
    .not('active_campaign_id', 'is', null);
  const states = db.unwrap(data as Array<{ driver_id: string }> | null, error) ?? [];
  const results = await Promise.all(states.map((state) => releaseTerminalDriverState(db, state.driver_id)));
  return results.filter(Boolean).length;
}
