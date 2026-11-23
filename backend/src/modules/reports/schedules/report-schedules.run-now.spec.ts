jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import 'reflect-metadata';
import { IdempotencyError, idempotencyErrorCodes } from '../../../common/idempotency/idempotency.error';
import type { AuthorizationPrincipal } from '../../authentication/authentication.types';
import { mapReportsError } from '../map-reports-error';
import { reportErrorCodes } from '../reports.constants';
import { ReportsError } from '../reports.error';
import { reportSchedulesManualJobName } from './report-schedule.constants';
import { ReportSchedulesController } from './report-schedules.controller';
import { ReportSchedulesService } from './report-schedules.service';

/**
 * W7.106 (`BA-reports-16`): „Pošalji sada” had no command identity — a double click, a browser retry after a
 * timeout or a second tab each queued a fresh manual run, and each run sent a real e-mail to every recipient.
 *
 * The command now carries the client's `Idempotency-Key` from the header all the way to the run row:
 *
 * 1. the same key replays the stored response instead of queueing a second job;
 * 2. the same key with a different schedule is refused (it is a different command, not a replay);
 * 3. the job carries the key, and the unique `ReportScheduleRun.commandKey` is the final gate — see
 *    `report-schedules.spec.ts` for the worker side.
 */
const actor = {
  principal: { subjectId: 'admin-1', email: 'admin@example.com', displayName: 'Admin' } as AuthorizationPrincipal,
  requestId: null,
};

const key = 'send-now-12345678';

type StoredCommand = {
  readonly request: string;
  readonly body: { readonly queued: boolean };
};

/** The subset of `RequestIdempotencyService` the service uses, with the same observable semantics. */
function createFakeIdempotency() {
  const records = new Map<string, StoredCommand>();
  const executed: string[] = [];
  const service = {
    execute: async <T>(input: {
      readonly namespace: string;
      readonly key: string;
      readonly request: unknown;
      readonly operation: () => Promise<{ readonly statusCode: number; readonly body: T }>;
    }): Promise<{ readonly statusCode: number; readonly body: T; readonly replayed: boolean }> => {
      const composite = `${input.namespace}|${input.key}`;
      const serialized = JSON.stringify(input.request);
      const existing = records.get(composite);
      if (existing !== undefined) {
        if (existing.request !== serialized) {
          throw new IdempotencyError(idempotencyErrorCodes.payloadMismatch);
        }
        return { statusCode: 202, body: existing.body as T, replayed: true };
      }
      const result = await input.operation();
      records.set(composite, { request: serialized, body: result.body as { queued: boolean } });
      executed.push(composite);
      return { ...result, replayed: false };
    },
  };
  return { service, records, executed };
}

function createHarness(options: { readonly accessible?: boolean; readonly withQueue?: boolean; readonly withIdempotency?: boolean } = {}) {
  const added: { name: string; data: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  const prisma = {
    reportSchedule: {
      findUnique: async () =>
        options.accessible === false
          ? null
          : {
              id: 'sch-1',
              name: 'Weekly IT',
              organizationalUnitId: 'ou-it',
              organizationalUnit: { id: 'ou-it', name: 'IT', ouPath: '/Korisnici/IT' },
              service: null,
              group: null,
              recipients: [{ userId: 'u-1', user: { id: 'u-1', displayName: 'U', email: 'u@example.com', isActive: true } }],
              enabled: true,
              frequency: 'WEEKLY',
              sendTime: '07:00',
              sections: ['kpi'],
              packKeys: [],
              priority: null,
              version: 1,
              nextRunAt: new Date('2026-05-04T05:00:00.000Z'),
              lastRunAt: null,
              createdByUserId: 'admin-1',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              createdBy: { id: 'admin-1', displayName: 'Admin' },
            },
    },
  };
  const idempotency = options.withIdempotency === false ? undefined : createFakeIdempotency();
  const queue =
    options.withQueue === false
      ? undefined
      : {
          add: async (name: string, data: Record<string, unknown>, jobOptions: Record<string, unknown>) => {
            added.push({ name, data, options: jobOptions });
            return { id: String(jobOptions.jobId) };
          },
        };
  const service = new ReportSchedulesService(
    prisma as never,
    {
      load: async () => ({
        enabled: true,
        maxSchedules: 50,
        maxRecipients: 25,
        attachmentMaxRows: 10_000,
        defaultSendTime: '07:00',
        timeZone: 'Europe/Sarajevo',
      }),
    } as never,
    {
      load: async () => ({
        reportsEnabled: true,
        addonEnabled: true,
        enabledPacks: [],
        allowedFormats: ['csv'],
        bottlenecksEnabled: true,
        defaultWindowDays: 30,
        packWindowDays: 30,
        csatScaleMax: 5,
        pingPongThreshold: 3,
      }),
    } as never,
    { canAccess: async () => options.accessible !== false, canUseScheduleService: async () => true } as never,
    { run: async () => ({ runId: null, status: 'SENT', sentCount: 0, skipped: [] }) } as never,
    queue as never,
    idempotency?.service as never,
  );
  return { service, added, idempotency };
}

describe('„send now” command idempotency (BA-reports-16)', () => {
  it('queues one job that carries the command key and a BullMQ-safe job id', async () => {
    const { service, added } = createHarness();

    await expect(service.runNow(actor, 'sch-1', key)).resolves.toEqual({ queued: true });

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      name: reportSchedulesManualJobName,
      data: { scheduleId: 'sch-1', actorUserId: 'admin-1', commandKey: key },
      options: { attempts: 1 },
    });
    // BullMQ refuses an id containing `:` and our keys may contain one, so the id is a hash of the key.
    expect(String(added[0]!.options.jobId)).toMatch(/^report-manual-[0-9a-f]{32}$/);
    expect(String(added[0]!.options.jobId)).not.toContain(':');
  });

  it('replays the response for a repeated key instead of queueing a second e-mail', async () => {
    const { service, added } = createHarness();

    await service.runNow(actor, 'sch-1', key);
    await expect(service.runNow(actor, 'sch-1', key)).resolves.toEqual({ queued: true });

    expect(added).toHaveLength(1);
  });

  it('is deterministic: the same key produces the same job id, another key another one', async () => {
    const { service, added } = createHarness();

    await service.runNow(actor, 'sch-1', key);
    await service.runNow(actor, 'sch-1', 'send-now-87654321');

    expect(added).toHaveLength(2);
    expect(added[0]!.options.jobId).not.toBe(added[1]!.options.jobId);
  });

  it('refuses the same key for a different schedule, because that is a different command', async () => {
    const { service, added } = createHarness();

    await service.runNow(actor, 'sch-1', key);

    await expect(service.runNow(actor, 'sch-2', key)).rejects.toMatchObject({
      code: idempotencyErrorCodes.payloadMismatch,
    });
    expect(added).toHaveLength(1);
  });

  it.each([
    ['too short', 'short'],
    ['with a space', 'send now 12345678'],
    ['with a slash', 'send/now/12345678'],
    ['only punctuation', '........'],
  ])('rejects a malformed key (%s) before doing anything', async (_label, badKey) => {
    const { service, added, idempotency } = createHarness();

    await expect(service.runNow(actor, 'sch-1', badKey)).rejects.toMatchObject({
      code: reportErrorCodes.idempotencyKeyInvalid,
    });
    expect(added).toHaveLength(0);
    expect(idempotency?.records.size).toBe(0);
  });

  it('does not queue anything when the agent cannot reach the schedule', async () => {
    const { service, added } = createHarness({ accessible: false });

    await expect(service.runNow(actor, 'sch-1', key)).rejects.toMatchObject({
      code: reportErrorCodes.scheduleNotFound,
    });
    expect(added).toHaveLength(0);
  });

  it('keeps answering `queued: false` when the worker queue is not configured', async () => {
    const { service } = createHarness({ withQueue: false });

    await expect(service.runNow(actor, 'sch-1', key)).resolves.toEqual({ queued: false });
  });

  it('still queues when the idempotency service is not injected (defensive, not the production path)', async () => {
    const { service, added } = createHarness({ withIdempotency: false });

    await expect(service.runNow(actor, 'sch-1', key)).resolves.toEqual({ queued: true });
    expect(added).toHaveLength(1);
  });

  it('maps the idempotency failures to the same HTTP statuses the ticket commands use', async () => {
    const statuses = [idempotencyErrorCodes.payloadMismatch, idempotencyErrorCodes.inProgress].map(
      (code) => mapReportsError(new IdempotencyError(code as never)).getStatus(),
    );
    expect(statuses).toEqual([409, 409]);
    expect(mapReportsError(new IdempotencyError(idempotencyErrorCodes.invalidKey)).getStatus()).toBe(400);
    // A malformed key that the service rejected itself is a plain 400 with the report module's own code.
    expect(
      mapReportsError(new ReportsError(reportErrorCodes.idempotencyKeyInvalid)).getStatus(),
    ).toBe(400);
  });

  it('refuses a request without the header, before touching the service', () => {
    const runNow = jest.fn(async () => ({ queued: true }));
    const controller = new ReportSchedulesController({ runNow } as never);
    const call = (key: string | undefined) =>
      (
        controller as unknown as {
          runNow: (id: string, key: string | undefined, request: unknown) => unknown;
        }
      ).runNow('sch-1', key, { headers: {} });

    for (const bad of [undefined, '   ']) {
      let caught: unknown;
      try {
        call(bad);
      } catch (error) {
        caught = error;
      }
      // `BadRequestException.getResponse()` carries the body the client sees, so this is the real contract.
      expect((caught as { getResponse: () => unknown }).getResponse()).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      });
    }
    expect(runNow).not.toHaveBeenCalled();
  });
});
