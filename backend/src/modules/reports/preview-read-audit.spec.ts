jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { ForbiddenException } from '@nestjs/common';
import { auditActionSchemaRegistry } from '../audit-log/audit-action-schema-registry';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { prepareAuditEntry } from '../audit-log/audit-event-policy';
import { publishedArticleSeed } from '../knowledge-base/published-article-seed';
import { ticketsTestIds } from '../tickets/tickets-test-ids';
import { createReportsServiceHarness } from './create-reports-service-harness';
import { ReportsController } from './reports.controller';
import { reportPackKeys, reportPackLimits } from './reports.constants';

type AuditRow = {
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  actorUserId: string | null;
  requestId: string | null;
  organizationalUnitId: string | null;
};

/**
 * W7.108 (`BA-reports-18`): the audit had a formal decision to make — is a pack
 * preview a read audit or high-volume telemetry? It is a **read audit**: the
 * preview returns exactly the personal rows the audited export returns, so a
 * metric-only or silent preview would let an administrator read the same data
 * row by row and leave no trace.
 */
const now = new Date('2026-09-14T12:00:00.000Z');
const scope = {
  organizationalUnitId: ticketsTestIds.ouIt,
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-09-30T23:59:59.000Z',
};

async function auditRows(harness: ReturnType<typeof createReportsServiceHarness>): Promise<AuditRow[]> {
  return (await harness.prisma.auditLog.findMany()) as unknown as AuditRow[];
}

describe('preview read audit (W7.108 / BA-reports-18)', () => {
  it('records who previewed which pack, window and how many rows they saw', async () => {
    const harness = createReportsServiceHarness();
    await harness.reports.previewPack(
      { ...scope, pack: reportPackKeys.monthlyKpi },
      ticketsTestIds.adminIt,
      'req-preview-1',
      now,
    );

    const rows = await auditRows(harness);
    expect(rows).toHaveLength(1);
    const [entry] = rows;
    expect(entry?.action).toBe('report.pack.previewed');
    expect(entry?.entityType).toBe(auditLogEntityTypes.reportPack);
    expect(entry?.entityId).toBe('monthly_kpi');
    expect(entry?.actorUserId).toBe(ticketsTestIds.adminIt);
    expect(entry?.requestId).toBe('req-preview-1');
    expect(entry?.organizationalUnitId).toBe(ticketsTestIds.ouIt);
    expect(entry?.metadata).toEqual({
      pack: 'monthly_kpi',
      organizationalUnitId: ticketsTestIds.ouIt,
      from: scope.from,
      to: scope.to,
      boundaries: '[from, to)',
      windowMode: 'mixed',
      recordCount: 1,
      truncated: false,
      truncatedInput: false,
    });
  });

  it('audits an empty preview too, so no read is silent', async () => {
    const harness = createReportsServiceHarness();
    // A row-level pack with nothing to list: the preview returns zero rows and
    // still leaves a record — the fact that the admin looked is the audit.
    const preview = await harness.reports.previewPack(
      { ...scope, pack: reportPackKeys.forwardPingPong },
      ticketsTestIds.adminIt,
      null,
      now,
    );
    expect(preview.rows).toHaveLength(0);

    const [entry] = await auditRows(harness);
    expect(entry?.action).toBe('report.pack.previewed');
    expect(entry?.entityId).toBe('forward_ping_pong');
    expect(entry?.metadata.recordCount).toBe(0);
    expect(entry?.metadata.truncated).toBe(false);
  });

  it('records the rows the actor actually received when the preview is capped', async () => {
    const harness = createReportsServiceHarness();
    for (let index = 0; index < reportPackLimits.previewRows + 1; index += 1) {
      const id = `kb-${index.toString().padStart(4, '0')}`;
      harness.articles.set(id, publishedArticleSeed({ id, organizationalUnitId: ticketsTestIds.ouIt }));
    }
    const preview = await harness.reports.previewPack(
      { ...scope, pack: reportPackKeys.kbHelpfulness },
      ticketsTestIds.adminIt,
      null,
      now,
    );
    expect(preview.truncated).toBe(true);

    const [entry] = await auditRows(harness);
    expect(entry?.metadata.recordCount).toBe(preview.rows.length);
    expect(entry?.metadata.truncated).toBe(true);
    // The input cap is the stronger fact: `recordCount` is a lower bound, not a total.
    expect(entry?.metadata.truncatedInput).toBe(true);
  });

  it('fails closed: an unauditable preview serves no rows', async () => {
    const harness = createReportsServiceHarness();
    const delegate = harness.prisma.auditLog as unknown as { create: unknown };
    delegate.create = async () => {
      throw new Error('audit store unavailable');
    };

    await expect(
      harness.reports.previewPack(
        { ...scope, pack: reportPackKeys.monthlyKpi },
        ticketsTestIds.adminIt,
        null,
        now,
      ),
    ).rejects.toThrow('audit store unavailable');
  });

  it('writes nothing when the read never happens (disabled pack)', async () => {
    const harness = createReportsServiceHarness({ enabledPacks: [] });
    await expect(
      harness.reports.previewPack(
        { ...scope, pack: reportPackKeys.monthlyKpi },
        ticketsTestIds.adminIt,
        null,
        now,
      ),
    ).rejects.toMatchObject({ code: 'REPORT_PACK_NOT_ENABLED' });
    expect(await auditRows(harness)).toHaveLength(0);
  });

  it('keeps preview and export events apart in the schema registry', () => {
    expect(auditLogActions.reportPackPreviewed).toBe('report.pack.previewed');
    expect(auditActionSchemaRegistry['report.pack.previewed']?.allowedKeys).toEqual(
      new Set([
        'boundaries',
        'from',
        'organizationalUnitId',
        'pack',
        'recordCount',
        'to',
        'truncated',
        'truncatedInput',
        'windowMode',
      ]),
    );
    // Export-only keys must not be admissible here: a preview has no file.
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.reportPackPreviewed,
        entityType: auditLogEntityTypes.reportPack,
        entityId: 'monthly_kpi',
        metadata: { pack: 'monthly_kpi', fileName: 'report.csv' },
        actorUserId: ticketsTestIds.adminIt,
      }),
    ).toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED:report.pack.previewed:fileName');
  });
});

describe('preview controller wiring (W7.108 / BA-reports-18)', () => {
  const request = (actorUserId: string | null) =>
    ({
      headers: { 'x-request-id': 'req-preview-9' },
      ...(actorUserId === null ? {} : { authenticatedPrincipal: { subjectId: actorUserId } }),
    }) as never;

  it('passes the actor and the request id into the audited read', async () => {
    const previewPack = jest.fn(async () => ({ pack: 'monthly_kpi' }));
    const controller = new ReportsController({ previewPack } as never, {} as never);

    // The route takes the kebab-case slug and the service sees the pack key.
    await controller.previewPack('monthly-kpi', { ...scope } as never, request('admin-9'));

    expect(previewPack).toHaveBeenCalledWith(
      expect.objectContaining({ pack: 'monthly_kpi', organizationalUnitId: ticketsTestIds.ouIt }),
      'admin-9',
      'req-preview-9',
    );
  });

  it('refuses a preview without an actor, because it could not be audited', async () => {
    const previewPack = jest.fn();
    const controller = new ReportsController({ previewPack } as never, {} as never);

    await expect(
      controller.previewPack('monthly-kpi', { ...scope } as never, request(null)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(previewPack).not.toHaveBeenCalled();
  });
});
