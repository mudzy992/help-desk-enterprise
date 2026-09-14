import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { ProcessTeamsStubIntegrationJobService } from './process-teams-stub-integration-job.service';

const validPayload = {
  eventType: 'ticket.created',
  event: 'ticket_created',
  ticketId: 'ticket-1',
  messageId: 'msg-1',
};

describe('ProcessTeamsStubIntegrationJobService', () => {
  const processorSourcePath = join(
    __dirname,
    'process-teams-stub-integration-job.service.ts',
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs would send to Teams and never calls an HTTP client', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({} as never);
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const service = new ProcessTeamsStubIntegrationJobService();
    await service.process(validPayload);
    expect(logSpy.mock.calls.some(([message]) =>
      String(message).includes('would send to Teams'),
    )).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not import an HTTP client', () => {
    const source = readFileSync(processorSourcePath, 'utf8');
    expect(source).not.toMatch(/HttpService|axios|undici|fetch\(/);
  });

  it('rejects an invalid payload without HTTP', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({} as never);
    const service = new ProcessTeamsStubIntegrationJobService();
    await expect(service.process({})).rejects.toThrow(
      /Invalid TEAMS_STUB integration job payload/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});