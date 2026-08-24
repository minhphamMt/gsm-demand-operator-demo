import { ConfigService } from '@nestjs/config';

import {
  dispatchSimulationDurationMs,
  DispatchSimulationService,
  nextSimulatedDispatchEvent,
  simulatedDispatchEventDueAt,
} from './dispatch-simulation.service';

describe('DispatchSimulationService', () => {
  it.each([
    ['PLANNED', 'SENT'],
    ['SENT', 'ACKNOWLEDGED'],
    ['ACKNOWLEDGED', 'EN_ROUTE'],
    ['EN_ROUTE', 'ARRIVED'],
    ['ARRIVED', 'AVAILABLE'],
    ['AVAILABLE', undefined],
    ['FAILED', undefined],
  ])('maps %s to the next telemetry event', (state, expected) => {
    expect(nextSimulatedDispatchEvent(state)).toBe(expected);
  });

  it('is fail-closed when local simulation is not explicitly enabled', () => {
    jest.useFakeTimers();
    const service = new DispatchSimulationService({} as never, new ConfigService({ OPERATOR_DISPATCH_SIMULATION_ENABLED: 'false' }));
    const advance = jest.spyOn(service, 'advance');

    service.onModuleInit();
    jest.advanceTimersByTime(10_000);

    expect(advance).not.toHaveBeenCalled();
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('keeps every route active until no earlier than ETA minus three minutes', () => {
    const releasedAt = '2026-08-25T00:00:00.000Z';
    const releaseMs = Date.parse(releasedAt);

    expect(dispatchSimulationDurationMs(15)).toBe(12 * 60_000);
    expect(simulatedDispatchEventDueAt(releasedAt, 'move-1', 15, 'AVAILABLE'))
      .toBe(releaseMs + 12 * 60_000);
    expect(dispatchSimulationDurationMs(2)).toBe(60_000);
  });

  it('staggers the full telemetry lifecycle across deterministic move profiles', () => {
    const releasedAt = '2026-08-25T00:00:00.000Z';
    const events = ['SENT', 'ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED', 'AVAILABLE'] as const;
    const first = events.map((event) => simulatedDispatchEventDueAt(releasedAt, 'move-1', 15, event));
    const second = events.map((event) => simulatedDispatchEventDueAt(releasedAt, 'move-2', 15, event));

    expect(first).toEqual([...first].sort((left, right) => left - right));
    expect(second).toEqual([...second].sort((left, right) => left - right));
    expect(first.slice(0, -1)).not.toEqual(second.slice(0, -1));
    expect(first.at(-1)).toBe(second.at(-1));
  });

  it('records one idempotent, verified local telemetry event per advance', async () => {
    const batchQuery = { select: jest.fn(), in: jest.fn(), order: jest.fn() };
    batchQuery.select.mockReturnValue(batchQuery);
    batchQuery.in.mockReturnValue(batchQuery);
    batchQuery.order.mockResolvedValue({ data: [{ id: 'batch-1', released_at: '2026-08-25T00:00:00.000Z', released_by: 'operator-1' }], error: null });
    const moveQuery = { select: jest.fn(), eq: jest.fn(), order: jest.fn() };
    moveQuery.select.mockReturnValue(moveQuery);
    moveQuery.eq.mockReturnValue(moveQuery);
    moveQuery.order.mockResolvedValue({
      data: [{ id: 'move-1', batch_id: 'batch-1', state: 'ARRIVED', planned_units: 2, eta_minutes: 15 }],
      error: null,
    });
    const rpc = jest.fn().mockResolvedValue({ data: 'event-1', error: null });
    const db = {
      client: {
        from: jest.fn((table: string) => table === 'dispatch_batches' ? batchQuery : moveQuery),
        rpc,
      },
      unwrap: jest.fn((data: unknown, error: unknown) => {
        if (error) throw error;
        return data;
      }),
    };
    const service = new DispatchSimulationService(db as never, new ConfigService());

    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T00:20:00.000Z'));

    await expect(service.advance()).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith('record_dispatch_event', expect.objectContaining({
      p_batch_id: 'batch-1',
      p_move_id: 'move-1',
      p_event_key: 'local-sim:batch-1:move-1:AVAILABLE',
      p_event_type: 'AVAILABLE',
      p_units: 2,
      p_source: 'local-dispatch-simulator',
      p_payload: expect.objectContaining({
        accuracy_m: 10,
        inside_target: true,
        simulated: true,
        simulated_drivers: expect.arrayContaining([
          expect.objectContaining({ driver_id: expect.stringMatching(/^SIM-DRV-/) }),
        ]),
        target_available_at: '2026-08-25T00:12:00.000Z',
      }),
      p_actor_id: 'operator-1',
    }));
    jest.useRealTimers();
  });
});
