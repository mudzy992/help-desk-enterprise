import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { templateLimits } from '../templates.constants';
import { BulkAttachPlaybookDto } from './templates.dto';

describe('BulkAttachPlaybookDto', () => {
  function errors(ticketIds: readonly string[]) {
    return validateSync(plainToInstance(BulkAttachPlaybookDto, {
      playbookId: 'playbook-1',
      ticketIds,
    }));
  }

  it('accepts a request within the bounded synchronous limit', () => {
    expect(errors(Array.from({ length: templateLimits.bulkAttachSyncMaxTickets }, (_, index) => `ticket-${index}`))).toEqual([]);
  });

  it('rejects a request that exceeds the synchronous limit before service work starts', () => {
    const violations = errors(Array.from({ length: templateLimits.bulkAttachSyncMaxTickets + 1 }, (_, index) => `ticket-${index}`));
    expect(violations.some((error) => error.property === 'ticketIds')).toBe(true);
  });
});
