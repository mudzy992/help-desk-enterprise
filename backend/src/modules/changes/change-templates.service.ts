import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangeAccessService, type ChangeViewer } from './change-access.service';
import {
  assertChangeTemplateRevision,
  changeTemplateRevisionOf,
  changeTemplateUpdateAuditMetadata,
  type ChangeTemplateSnapshot,
} from './change-template-audit';
import { computeChangeRisk } from './change-rules';
import type { ChangeTemplateDto } from './changes.dto';
import { ChangeError, changeErrorCodes } from './changes.constants';
import { changeListLimit, changeListLimits, changeOverFetch, changePage } from './change-pagination';

const templateSelect = {
  id: true,
  name: true,
  description: true,
  implementationPlan: true,
  backoutPlan: true,
  testPlan: true,
  impact: true,
  likelihood: true,
  causesDowntime: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  services: { select: { service: { select: { id: true, name: true } } } },
  _count: { select: { changes: true } },
} as const;

/** W7.71: the row the edit is compared against, read inside the transaction. */
const templateSnapshotSelect = {
  name: true,
  description: true,
  implementationPlan: true,
  backoutPlan: true,
  testPlan: true,
  impact: true,
  likelihood: true,
  causesDowntime: true,
  isActive: true,
  updatedAt: true,
  services: { select: { serviceId: true } },
} as const;


function snapshotOf(row: {
  name: string;
  description: string;
  implementationPlan: string;
  backoutPlan: string;
  testPlan: string | null;
  impact: string;
  likelihood: string;
  causesDowntime: boolean;
  isActive: boolean;
  services: readonly { serviceId: string }[];
}): ChangeTemplateSnapshot {
  return {
    name: row.name,
    description: row.description,
    implementationPlan: row.implementationPlan,
    backoutPlan: row.backoutPlan,
    testPlan: row.testPlan,
    impact: row.impact,
    likelihood: row.likelihood,
    causesDowntime: row.causesDowntime,
    isActive: row.isActive,
    serviceIds: row.services.map((link) => link.serviceId),
  };
}

/**
 * Paket 3.4 (§13): standard change templates. Reading is open to every change
 * reader (the form offers them); saving needs change.manage. Templates are
 * deactivated, never deleted, so existing changes keep their reference.
 */
@Injectable()
export class ChangeTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChangeAccessService,
  ) {}

  /**
   * Catalogue (§13). W7.76 (`BA-changes-18`): 500 rows used to be the end of the
   * list with no way to see the rest; the list is now a cursor page and says
   * whether more templates exist.
   */
  async list(
    viewer: ChangeViewer,
    includeInactive: boolean,
    page: { readonly limit?: number; readonly cursor?: string } = {},
  ) {
    await this.access.require(viewer, permissionKeys.changeRead);
    const showInactive = includeInactive && this.access.hasPermission(viewer, permissionKeys.changeManage);
    const limit = changeListLimit(page.limit, changeListLimits.templates);
    const rows = await this.prisma.changeTemplate.findMany({
      where: showInactive ? {} : { isActive: true },
      select: templateSelect,
      // `id` closes the ordering so a page boundary cannot repeat or skip a row
      // that shares a name with its neighbour.
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      take: changeOverFetch(limit),
      ...(page.cursor === undefined ? {} : { cursor: { id: page.cursor }, skip: 1 }),
    });
    const { items, hasMore, nextCursor } = changePage(rows, limit);
    return { items: items.map((row) => this.toResponse(row)), hasMore, nextCursor };
  }

  async get(viewer: ChangeViewer, id: string) {
    await this.access.require(viewer, permissionKeys.changeRead);
    const row = await this.prisma.changeTemplate.findUnique({ where: { id }, select: templateSelect });
    if (row === null) throw new ChangeError(changeErrorCodes.templateNotFound);
    if (!row.isActive && !this.access.hasPermission(viewer, permissionKeys.changeManage)) throw new ChangeError(changeErrorCodes.templateNotFound);
    return this.toResponse(row);
  }

  async create(viewer: ChangeViewer, input: ChangeTemplateDto) {
    await this.access.require(viewer, permissionKeys.changeManage);
    const data = await this.normalize(input);
    const id = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.changeTemplate.create({
        data: { ...data.fields, services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) } },
        select: { id: true },
      });
      await this.audit(transaction as unknown as AuditLogTransactionalClient, created.id, viewer.userId, {
        operation: 'created',
      });
      return created.id;
    });
    return this.get(viewer, id);
  }

  /**
   * W7.71 (`BA-changes-15`): a template edit is a conditional write. The
   * revision the editor loaded travels in `If-Match`; the row is compared
   * inside the transaction that writes it, so two managers can no longer
   * replace each other's fields and service links while both get an "updated"
   * audit row. The previous and the new revision are named in that row, and a
   * save that changes nothing writes neither the row nor the audit entry.
   */
  async update(viewer: ChangeViewer, id: string, input: ChangeTemplateDto, ifMatch: string | undefined) {
    await this.access.require(viewer, permissionKeys.changeManage);
    const data = await this.normalize(input);
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.changeTemplate.findUnique({
        where: { id },
        select: templateSnapshotSelect,
      });
      if (current === null) throw new ChangeError(changeErrorCodes.templateNotFound);
      const previousRevision = assertChangeTemplateRevision(current, ifMatch);
      const before = snapshotOf(current);
      const after: ChangeTemplateSnapshot = { ...data.fields, serviceIds: data.serviceIds };
      const initial = changeTemplateUpdateAuditMetadata({ before, after, previousRevision });
      if (initial.changedFields.length === 0) return;

      const written = await transaction.changeTemplate.updateMany({
        where: { id, updatedAt: current.updatedAt },
        // The revision is set explicitly: the compare above reads `updatedAt`,
        // so the write has to move it even if a previous save happened inside
        // the same millisecond.
        data: { ...data.fields, updatedAt: new Date() },
      });
      // The row moved between the read and the write: another editor won.
      if (written.count !== 1) throw new ChangeError(changeErrorCodes.templateStale);
      await transaction.changeTemplateService.deleteMany({ where: { templateId: id } });
      if (data.serviceIds.length > 0) {
        await transaction.changeTemplateService.createMany({
          data: data.serviceIds.map((serviceId) => ({ templateId: id, serviceId })),
        });
      }
      const updated = await transaction.changeTemplate.findUniqueOrThrow({
        where: { id },
        select: { updatedAt: true },
      });
      const diff = changeTemplateUpdateAuditMetadata({
        before,
        after,
        previousRevision,
        revision: changeTemplateRevisionOf(updated),
      });
      await this.audit(
        transaction as unknown as AuditLogTransactionalClient,
        id,
        viewer.userId,
        diff.metadata as Record<string, unknown>,
      );
    });
    return this.get(viewer, id);
  }

  private async normalize(input: ChangeTemplateDto) {
    const name = input.name.trim();
    const implementationPlan = input.implementationPlan.trim();
    const backoutPlan = input.backoutPlan.trim();
    if (name.length < 3) throw new ChangeError(changeErrorCodes.validation, 'name');
    if (implementationPlan.length === 0) throw new ChangeError(changeErrorCodes.requirementMissing, 'implementationPlan');
    if (backoutPlan.length === 0) throw new ChangeError(changeErrorCodes.requirementMissing, 'backoutPlan');
    const risk = computeChangeRisk(input.impact, input.likelihood);
    if (risk === 'HIGH' || risk === 'CRITICAL') throw new ChangeError(changeErrorCodes.templateRisk, risk);
    const serviceIds = [...new Set((input.serviceIds ?? []).map((value) => value.trim()).filter((value) => value.length > 0))];
    if (serviceIds.length > 0 && (await this.prisma.service.count({ where: { id: { in: serviceIds } } })) !== serviceIds.length) {
      throw new ChangeError(changeErrorCodes.serviceNotFound);
    }
    const testPlan = input.testPlan?.trim() ?? '';
    return {
      fields: {
        name,
        description: input.description.trim(),
        implementationPlan,
        backoutPlan,
        testPlan: testPlan.length === 0 ? null : testPlan,
        impact: input.impact,
        likelihood: input.likelihood,
        causesDowntime: input.causesDowntime ?? false,
        isActive: input.isActive ?? true,
      },
      serviceIds,
    };
  }

  private async audit(
    client: AuditLogTransactionalClient,
    id: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ) {
    await recordAuditEntry(client, {
      action: auditLogActions.changeTemplateSaved,
      entityType: auditLogEntityTypes.changeTemplate,
      entityId: id,
      metadata: metadata as never,
      actorUserId,
    });
  }

  private toResponse(row: {
    id: string;
    name: string;
    description: string;
    implementationPlan: string;
    backoutPlan: string;
    testPlan: string | null;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    likelihood: 'LOW' | 'MEDIUM' | 'HIGH';
    causesDowntime: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    services: { service: { id: string; name: string } }[];
    _count: { changes: number };
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      implementationPlan: row.implementationPlan,
      backoutPlan: row.backoutPlan,
      testPlan: row.testPlan,
      impact: row.impact,
      likelihood: row.likelihood,
      risk: computeChangeRisk(row.impact, row.likelihood),
      causesDowntime: row.causesDowntime,
      isActive: row.isActive,
      services: row.services.map((link) => link.service),
      usageCount: row._count.changes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      /** W7.71: the token the editor must send back in `If-Match` when saving. */
      revision: changeTemplateRevisionOf(row),
    };
  }
}
