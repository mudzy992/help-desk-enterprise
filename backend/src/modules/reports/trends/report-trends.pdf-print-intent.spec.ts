jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { auditActionCompatibilityRegistry } from '../../audit-log/audit-action-compatibility-registry';
import { auditActionSchemaRegistry } from '../../audit-log/audit-action-schema-registry';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { prepareAuditEntry } from '../../audit-log/audit-event-policy';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../../authentication/authenticated-request';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { ReportsController } from '../reports.controller';
import { ReportsError } from '../reports.error';
import { InMemoryReportTrendSource } from './in-memory-report-trend-source';
import { ReportTrendsService } from './report-trends.service';

type AuditCreateArgs = {
  readonly data: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly metadata: Record<string, unknown>;
    readonly requestId: string | null;
    readonly actorUserId: string | null;
    readonly organizationalUnitId: string | null;
    readonly actionSchemaVersion: number;
  };
};

/**
 * W7.107 (`BA-reports-17`): the „Save as PDF” button is a browser dialog. These
 * tests pin the corrected contract — the server records a **print intent**
 * (`report.pdf.print_intent`) that says who owns the document and that no
 * artefact was stored, and it never again writes the old
 * `report.pdf.exported` claim.
 */
function createService(overrides: { reportsEnabled?: boolean } = {}) {
  const audit: AuditCreateArgs[] = [];
  const prisma = {
    $executeRaw: async () => 0,
    organizationalUnit: {
      findMany: async () => [],
      findUnique: async () => ({ name: 'IT' }),
    },
    auditLog: {
      findFirst: async () => null,
      create: async (args: AuditCreateArgs) => {
        audit.push(args);
        return {};
      },
    },
  };
  const service = new ReportTrendsService(
    prisma as never,
    {
      load: async () => ({
        reportsEnabled: overrides.reportsEnabled ?? true,
        addonEnabled: true,
        enabledPacks: [],
        allowedFormats: ['csv', 'json'],
        bottlenecksEnabled: true,
        defaultWindowDays: 30,
        packWindowDays: 30,
        csatScaleMax: 5,
        pingPongThreshold: 3,
      }),
    } as never,
    {
      load: async () => ({
        enabled: true,
        maxMonths: 36,
        cacheSeconds: 600,
        slaTargetPercent: 90,
        csatMinSample: 5,
        csatScaleMax: 5,
        timeZone: 'Europe/Sarajevo',
      }),
    } as never,
    { read: async () => null, write: async () => undefined } as never,
    new InMemoryReportTrendSource(() => ({ tickets: [], csat: [], services: [] }) as never),
  );
  return { service, audit };
}

function request(actorUserId: string | null, requestId = 'req-print-1'): AuthenticatedHttpRequest {
  return {
    headers: { 'x-request-id': requestId },
    ...(actorUserId === null
      ? {}
      : { [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: { subjectId: actorUserId } }),
  } as unknown as AuthenticatedHttpRequest;
}

function body(): { organizationalUnitId: string; view: 'overview' | 'trends'; from: string; to: string } {
  return { organizationalUnitId: 'ou-it', view: 'trends', from: '2026-01-01', to: '2026-01-31' };
}

describe('ReportTrendsService.recordPdfPrintIntent (W7.107 / BA-reports-17)', () => {
  it('records a print intent that names the client as the renderer', async () => {
    const { service, audit } = createService();
    await service.recordPdfPrintIntent(body(), 'admin-1', 'req-print-1');

    expect(audit).toHaveLength(1);
    const entry = audit[0]!.data;
    expect(entry.action).toBe('report.pdf.print_intent');
    expect(entry.entityType).toBe(auditLogEntityTypes.reportTrends);
    expect(entry.entityId).toBe('ou-it');
    expect(entry.organizationalUnitId).toBe('ou-it');
    expect(entry.actorUserId).toBe('admin-1');
    expect(entry.requestId).toBe('req-print-1');
    expect(entry.metadata).toEqual({
      view: 'trends',
      from: '2026-01-01',
      to: '2026-01-31',
      renderer: 'client',
      artifactStored: false,
    });
    expect(entry.actionSchemaVersion).toBe(1);
  });

  it('never claims a produced artefact: no format, size, page or row count', async () => {
    const { service, audit } = createService();
    await service.recordPdfPrintIntent(body(), 'admin-1', null);

    const metadata = audit[0]!.data.metadata;
    for (const forbidden of ['format', 'bytes', 'pages', 'pageCount', 'recordCount', 'fileName', 'download']) {
      expect(metadata).not.toHaveProperty(forbidden);
    }
    // The set is closed: anything richer than the view/window plus the two
    // honesty flags would need a new schema version.
    expect(Object.keys(metadata).sort()).toEqual(
      ['artifactStored', 'from', 'renderer', 'to', 'view'].sort(),
    );
  });

  it('does not write the historical export action any more', async () => {
    const { service, audit } = createService();
    await service.recordPdfPrintIntent(body(), 'admin-1', null);
    expect(audit.map((entry) => entry.data.action)).not.toContain('report.pdf.exported');
  });

  it('keeps the old action registered so historical rows still resolve', () => {
    // Rows written before W7.107 are immutable facts about what the old code
    // claimed; deleting the action would break their chain rendering, filters
    // and export. It stays readable and is simply no longer written.
    expect(auditActionCompatibilityRegistry['report.pdf.exported']).toBeDefined();
    expect(auditActionSchemaRegistry['report.pdf.exported']?.allowedKeys).toEqual(
      new Set(['from', 'to', 'view']),
    );
    expect(auditLogActions.reportPdfExported).toBe('report.pdf.exported');
    expect(auditActionSchemaRegistry['report.pdf.print_intent']?.allowedKeys).toEqual(
      new Set(['artifactStored', 'from', 'renderer', 'to', 'view']),
    );
  });

  it('rejects an export-shaped payload for the new action', () => {
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.reportPdfPrintIntent,
        entityType: auditLogEntityTypes.reportTrends,
        entityId: 'ou-it',
        metadata: { view: 'trends', renderer: 'client', artifactStored: false, format: 'pdf' },
        actorUserId: 'admin-1',
      }),
    ).toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED:report.pdf.print_intent:format');
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.reportPdfPrintIntent,
        entityType: auditLogEntityTypes.reportTrends,
        entityId: 'ou-it',
        metadata: { view: 'trends', renderer: 'client', artifactStored: false },
        actorUserId: 'admin-1',
      }),
    ).not.toThrow();
  });

  it('follows the reports switch and writes nothing while reports are disabled', async () => {
    const { service, audit } = createService({ reportsEnabled: false });
    await expect(service.recordPdfPrintIntent(body(), 'admin-1', null)).rejects.toMatchObject({
      code: 'REPORTS_DISABLED',
    });
    expect(audit).toHaveLength(0);
  });
});

describe('ReportsController print-intent route (W7.107 / BA-reports-17)', () => {
  function createController(record = jest.fn(async (..._args: unknown[]) => undefined)) {
    const controller = new ReportsController({} as never, {
      recordPdfPrintIntent: record,
    } as never);
    return { controller, record };
  }

  it('serves the honest route name and no longer exposes the export path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ReportsController.prototype.recordPdfPrintIntent)).toBe(
      'pdf-print-intents',
    );
    expect(Object.getOwnPropertyNames(ReportsController.prototype)).not.toContain('recordPdfExport');
  });

  it('passes the body, the actor and the request id to the service', async () => {
    const { controller, record } = createController();
    const payload = body();
    await controller.recordPdfPrintIntent(payload, request('admin-1'));

    expect(record).toHaveBeenCalledWith(payload, 'admin-1', 'req-print-1');
  });

  it('refuses to record a beacon without an actor', async () => {
    const { controller, record } = createController();
    // The handler is async, so the guard failure surfaces as a rejection.
    await expect(controller.recordPdfPrintIntent(body(), request(null))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('maps a disabled reports module to the HTTP error instead of a raw throw', async () => {
    const { controller } = createController(
      jest.fn(async () => {
        throw new ReportsError('REPORTS_DISABLED');
      }),
    );
    await expect(controller.recordPdfPrintIntent(body(), request('admin-1'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rethrows unexpected failures instead of disguising them as a client error', async () => {
    const boom = new Error('audit store unavailable');
    const { controller } = createController(
      jest.fn(async () => {
        throw boom;
      }),
    );
    await expect(controller.recordPdfPrintIntent(body(), request('admin-1'))).rejects.toBe(boom);
  });
});
