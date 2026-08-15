import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const channel = {
  on: vi.fn(),
  subscribe: vi.fn(),
};
const removeChannel = vi.fn();
const supabase = {
  channel: vi.fn(() => channel),
  removeChannel,
};

vi.mock('../lib/supabase', () => ({ requireSupabase: () => supabase }));
vi.mock('../state/AuthProvider', () => ({ useDriverId: () => 'driver-1' }));

import { DriverRealtime } from './DriverRealtime';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('DriverRealtime', () => {
  beforeEach(() => {
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReset().mockReturnValue(channel);
    channel.on.mockClear();
    supabase.channel.mockClear();
    removeChannel.mockClear();
    setVisibility('visible');
  });

  afterEach(() => setVisibility('visible'));

  it('does not keep a database realtime subscription while the page is hidden', async () => {
    setVisibility('hidden');
    const client = new QueryClient();
    const view = render(<QueryClientProvider client={client}><DriverRealtime /></QueryClientProvider>);

    expect(supabase.channel).not.toHaveBeenCalled();

    await act(async () => setVisibility('visible'));
    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith('driver:driver-1'));
    view.unmount();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
