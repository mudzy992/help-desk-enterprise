import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangeAccessService, type ChangeViewer } from './change-access.service';
import { computeChangeRisk } from './change-rules';
import type { ChangeTemplateDto } from './changes.dto';
import { ChangeError, changeErrorCodes } from './changes.constants';

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

  async list(viewer: ChangeViewer, includeInactive: boolean) {
    await this.access.require(viewer, permissionKeys.changeRead);
    const showInactive = includeInactive && this.access.hasPermission(viewer, permissionKeys.changeManage);
    const rows = await this.prisma.changeTemplate.findMany({
      where: showInactive ? {} : { isActive: true },
      select: templateSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: 500,
    });
    return { items: rows.map((row) => this.toResponse(row)) };
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
      await this.audit(transaction as unknown as AuditLogTransactionalClient, created.id, viewer.userId, 'created');
      return created.id;
    });
    return this.get(viewer, id);
  }

  async update(viewer: ChangeViewer, id: string, input: ChangeTemplateDto) {
    await this.access.require(viewer, permissionKeys.changeManage);
    if ((await this.prisma.changeTemplate.count({ where: { id } })) === 0) throw new ChangeError(changeErrorCodes.templateNotFound);
    const data = await this.normalize(input);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.changeTemplate.update({ where: { id }, data: data.fields });
      await transaction.changeTemplateService.deleteMany({ where: { templateId: id } });
      if (data.serviceIds.length > 0) {
        await transaction.changeTemplateService.createMany({ data: data.serviceIds.map((serviceId) => ({ templateId: id, serviceId })) });
      }
      await this.audit(transaction as unknown as AuditLogTransactionalClient, id, viewer.userId, 'updated');
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

  private async audit(client: AuditLogTransactionalClient, id: string, actorUserId: string, operation: 'created' | 'updated') {
    await recordAuditEntry(client, {
      action: auditLogActions.changeTemplateSaved,
      entityType: auditLogEntityTypes.changeTemplate,
      entityId: id,
      metadata: { operation } as never,
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
    };
  }
}
