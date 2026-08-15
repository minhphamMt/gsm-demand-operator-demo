import { ConflictException } from '@nestjs/common';

import { assertNoActiveExecution } from './active-execution.guard';

function query(result: Record<string, unknown>[]) {
  const chain = {
    in: jest.fn(),
    limit: jest.fn().mockResolvedValue({ data: result, error: null }),
    neq: jest.fn(),
    select: jest.fn(),
  };
  chain.in.mockReturnValue(chain);
  chain.neq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

describe('active execution guard', () => {
  it('blocks while another dispatch is still running', async () => {
    const campaignQuery = query([]);
    const dispatchQuery = query([{ id: 'batch-1', proposal_id: 'plan-1', status: 'IN_PROGRESS' }]);
    const db = {
      client: {
        from: jest.fn((table: string) => table === 'campaigns' ? campaignQuery : dispatchQuery),
      },
      unwrap: jest.fn((data: unknown) => data),
    };

    await expect(assertNoActiveExecution(db as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an idempotent apply retry for the same proposal', async () => {
    const campaignQuery = query([]);
    const dispatchQuery = query([]);
    const db = {
      client: {
        from: jest.fn((table: string) => table === 'campaigns' ? campaignQuery : dispatchQuery),
      },
      unwrap: jest.fn((data: unknown) => data),
    };

    await expect(assertNoActiveExecution(db as never, 'plan-1')).resolves.toBeUndefined();
    expect(campaignQuery.neq).toHaveBeenCalledWith('proposal_id', 'plan-1');
    expect(dispatchQuery.neq).toHaveBeenCalledWith('proposal_id', 'plan-1');
  });
});
