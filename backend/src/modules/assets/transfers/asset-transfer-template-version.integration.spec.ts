import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../../audit-log/audit-log.constants';
import type { AssetViewer } from '../asset-viewer';
import { AssetTransfersService } from './asset-transfers.service';
import { buildDefaultTransferTemplate } from './transfer-document';

jest.mock('../../tickets/attachments/scan-attachment-with-clamav', () => ({
  scanAttachmentWithClamav: jest.fn().mockResolvedValue(undefined),
}));

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase(
  'asset transfer template version allocation (PostgreSQL concurrency acceptance, W7.17)',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    let service: AssetTransfersService;
    let actorId: string;
    let stamp: string;
    const templateIds = new Set<string>();

    const viewer = (): AssetViewer => ({
      userId: actorId,
      isSuperAdmin: false,
      homeOrganizationalUnitId: null,
      grants: [],
    });

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      stamp = randomUUID().replaceAll('-', '').slice(0, 18);
      const actor = await prisma.user.create({
        data: {
          email: `w717-template-${stamp}@example.invalid`,
          displayName: 'W7.17 template allocation acceptance',
        },
        select: { id: true },
      });
      actorId = actor.id;

      const access = {
        require: jest.fn().mockResolvedValue({ all: true }),
        readSetting: jest.fn((_key: string, fallback: unknown) =>
          Promise.resolve(fallback),
        ),
      };
      service = new AssetTransfersService(
        prisma as never,
        access as never,
        {} as never,
      );
    });

    afterAll(async () => {
      if (!prisma) return;
      const uploaded = actorId
        ? await prisma.assetTransferTemplate.findMany({
            where: { uploadedByUserId: actorId },
            select: { id: true },
          })
        : [];
      const ids = [...new Set([
        ...templateIds,
        ...uploaded.map((row) => row.id),
      ])];
      if (ids.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            action: auditLogActions.assetTransferTemplateUploaded,
            entityId: { in: ids },
          },
        });
        await prisma.assetTransferTemplate.deleteMany({
          where: { id: { in: ids } },
        });
      }
      if (actorId) await prisma.user.deleteMany({ where: { id: actorId } });
      await prisma.$disconnect();
    });

    it('assigns distinct contiguous versions and atomically records one audit row per concurrent upload', async () => {
      const before = await prisma.assetTransferTemplate.aggregate({
        _max: { version: true },
      });
      const firstVersion = (before._max.version ?? 0) + 1;
      const uploadCount = 5;
      const buffer = buildDefaultTransferTemplate('bs');

      const results = await Promise.all(
        Array.from({ length: uploadCount }, (_, index) =>
          service.uploadTemplate(
            { fileName: `w717-${stamp}-${index}.docx`, buffer },
            `parallel upload ${index}`,
            viewer(),
          ),
        ),
      );
      for (const result of results) templateIds.add(result.id);

      const versions = results
        .map((result) => result.version)
        .sort((left, right) => left - right);
      expect(versions).toEqual(
        Array.from({ length: uploadCount }, (_, index) => firstVersion + index),
      );

      const audits = await prisma.auditLog.findMany({
        where: {
          action: auditLogActions.assetTransferTemplateUploaded,
          entityType: auditLogEntityTypes.assetTransfer,
          entityId: { in: results.map((result) => result.id) },
        },
        select: { entityId: true, actorUserId: true, metadata: true },
      });
      expect(audits).toHaveLength(uploadCount);
      expect(audits.every((row) => row.actorUserId === actorId)).toBe(true);
      expect(
        audits
          .map((row) => (row.metadata as { version: number }).version)
          .sort((left, right) => left - right),
      ).toEqual(versions);
    });
  },
);
