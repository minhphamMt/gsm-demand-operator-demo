import { ConfigService } from '@nestjs/config';

import { DispatchSimulationService, nextSimulatedDispatchEvent } from './dispatch-simulation.service';

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

  it('records one idempotent, verified local telemetry event per advance', async () => {
    const batchQuery = { select: jest.fn(), in: jest.fn(), order: jest.fn() };
    batchQuery.select.mockReturnValue(batchQuery);
    batchQuery.in.mockReturnValue(batchQuery);
    batchQuery.order.mockResolvedValue({ data: [{ id: 'batch-1', released_by: 'operator-1' }], error: null });
    const moveQuery = { select: jest.fn(), eq: jest.fn(), order: jest.fn() };
    moveQuery.select.mockReturnValue(moveQuery);
    moveQuery.eq.mockReturnValue(moveQuery);
    moveQuery.order.mockResolvedValue({
      data: [{ id: 'move-1', batch_id: 'batch-1', state: 'ARRIVED', planned_units: 2 }],
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

    await expect(service.advance()).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith('record_dispatch_event', expect.objectContaining({
      p_batch_id: 'batch-1',
      p_move_id: 'move-1',
      p_event_key: 'local-sim:batch-1:move-1:AVAILABLE',
      p_event_type: 'AVAILABLE',
      p_units: 2,
      p_source: 'local-dispatch-simulator',
      p_payload: { accuracy_m: 10, inside_target: true, simulated: true },
      p_actor_id: 'operator-1',
    }));
  });
});
