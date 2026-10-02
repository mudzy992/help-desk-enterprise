import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { TICKET_ATTACHMENT_STORAGE } from '../../tickets/attachments/attachment-storage.token';
import type { TicketAttachmentStorage } from '../../tickets/attachments/attachments.types';
import { resolveUploadRoot } from '../../tickets/attachments/resolve-upload-root';
import type { PrivacyActor } from '../privacy-actor';
import { PrivacyConfigurationLoader } from '../privacy-configuration.loader';
import { privacyErrorCodes, privacyLimits, type ExportStatus } from '../privacy.constants';
import { PrivacyError } from '../privacy.error';
import { ExportBuilder, type ExportSummary } from './export-builder';
import { createExportDecryptStream, createExportEncryptStream, readExportDecryptionKeys, readExportMasterKey } from './export-cipher';

export const PRIVACY_EXPORT_ROOT = Symbol('PRIVACY_EXPORT_ROOT');
export const defaultPrivacyExportRoot = () => path.join(resolveUploadRoot(), 'privacy-exports');

export type ExportView = {
  readonly id: string;
  readonly subjectUserId: string;
  readonly subjectName: string;
  readonly requestId: string | null;
  readonly status: ExportStatus;
  readonly includeAttachments: boolean;
  readonly includeInternalNotes: boolean;
  readonly sizeBytes: number | null;
  readonly downloadCount: number;
  readonly error: string | null;
  readonly requestedByUserId: string | null;
  /** Only the person who started the export may download it (§5.1). */
  readonly canDownload: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

const exportSelect = {
  id: true,
  subjectUserId: true,
  requestId: true,
  status: true,
  includeAttachments: true,
  includeInternalNotes: true,
  sizeBytes: true,
  downloadCount: true,
  error: true,
  requestedByUserId: true,
  expiresAt: true,
  createdAt: true,
  completedAt: true,
} as const;

type ExportRow = {
  id: string;
  subjectUserId: string;
  requestId: string | null;
  status: string;
  includeAttachments: boolean;
  includeInternalNotes: boolean;
  sizeBytes: number | null;
  downloadCount: number;
  error: string | null;
  requestedByUserId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
};

/**
 * Paket 2.6 (§5): data-subject export. The API queues a request, the worker
 * builds the ZIP and stores it encrypted; the requester downloads it (fresh
 * MFA, counted, audited) until the link expires, then the file is deleted.
 */
@Injectable()
export class PrivacyExportService {
  private readonly logger = new Logger(PrivacyExportService.name);
  private readonly builder: ExportBuilder;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: PrivacyConfigurationLoader,
    @Inject(TICKET_ATTACHMENT_STORAGE) attachmentStorage: TicketAttachmentStorage,
    @Inject(PRIVACY_EXPORT_ROOT) private readonly root: string,
  ) {
    this.builder = new ExportBuilder(prisma, attachmentStorage);
  }

  async create(
    input: {
      readonly subjectUserId: string;
      readonly requestId?: string;
      readonly includeAttachments?: boolean;
      readonly includeInternalNotes?: boolean;
      readonly internalNotesReason?: string;
    },
    actor: PrivacyActor,
  ): Promise<{ readonly view: ExportView; readonly queued: boolean }> {
    const subject = await this.prisma.user.findUnique({ where: { id: input.subjectUserId }, select: { id: true } });
    if (subject === null) throw new PrivacyError(privacyErrorCodes.notFound);
    const reason = input.internalNotesReason?.trim() ?? '';
    if (input.includeInternalNotes === true && reason.length < 10) {
      throw new PrivacyError(privacyErrorCodes.invalidInput, { field: 'internalNotesReason' });
    }
    if (input.requestId !== undefined) {
      const linked = await this.prisma.dataSubjectRequest.count({ where: { id: input.requestId } });
      if (linked === 0) throw new PrivacyError(privacyErrorCodes.invalidInput, { field: 'requestId' });
    }
    if (readExportMasterKey() === null) throw new PrivacyError(privacyErrorCodes.invalidInput, { reason: 'export_key_missing' });
    const configuration = await this.configurationLoader.load();
    const actorId = actor.principal.subjectId;
    const created = await this.prisma.$transaction(async (transaction) => {
      const running = await transaction.privacyExport.count({
        where: { subjectUserId: input.subjectUserId, status: { in: ['QUEUED', 'RUNNING'] } },
      });
      if (running > 0) throw new PrivacyError(privacyErrorCodes.alreadyRunning);
      const row = await transaction.privacyExport.create({
        data: {
          subjectUserId: input.subjectUserId,
          requestId: input.requestId ?? null,
          status: 'QUEUED',
          includeAttachments: input.includeAttachments ?? configuration.exportIncludeAttachmentsDefault,
          includeInternalNotes: input.includeInternalNotes === true,
          internalNotesReason: input.includeInternalNotes === true ? reason.slice(0, 1000) : null,
          requestedByUserId: actorId,
        },
        select: { id: true, includeAttachments: true, includeInternalNotes: true },
      });
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.privacyExportRequested,
        entityType: auditLogEntityTypes.privacyExport,
        entityId: row.id,
        metadata: {
          subjectUserId: input.subjectUserId,
          includeAttachments: row.includeAttachments,
          includeInternalNotes: row.includeInternalNotes,
          // The admin's own justification for including others' notes (§5.1).
          internalNotesReason: row.includeInternalNotes ? reason.slice(0, 500) : null,
          requestId: input.requestId ?? null,
        },
        actorUserId: actorId,
        requestId: actor.requestId,
      });
      return row;
    });
    return { view: await this.get(created.id, actorId), queued: true };
  }

  async list(actorUserId: string): Promise<ExportView[]> {
    const rows = (await this.prisma.privacyExport.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: privacyLimits.requestsListed,
      select: exportSelect,
    })) as ExportRow[];
    return this.toViews(rows, actorUserId);
  }

  async get(id: string, actorUserId: string): Promise<ExportView> {
    const row = (await this.prisma.privacyExport.findUnique({ where: { id }, select: exportSelect })) as ExportRow | null;
    if (row === null) throw new PrivacyError(privacyErrorCodes.notFound);
    return (await this.toViews([row], actorUserId))[0];
  }

  /**
   * Download (the identity check is done by the caller). Decrypts on the fly;
   * every segment is authenticated before it is sent.
   */
  async openDownload(id: string, actor: PrivacyActor, now: Date = new Date()): Promise<{ stream: Readable; filename: string }> {
    const actorId = actor.principal.subjectId;
    const row = await this.assertDownloadable(id, actorId, now);
    const key = readExportMasterKey();
    if (key === null) throw new PrivacyError(privacyErrorCodes.exportNotReady);
    const file = this.filePath(row.id);
    await stat(file).catch(() => {
      throw new PrivacyError(privacyErrorCodes.exportExpired);
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.privacyExport.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.privacyExportDownloaded,
        entityType: auditLogEntityTypes.privacyExport,
        entityId: id,
        metadata: { subjectUserId: row.subjectUserId, download: row.downloadCount + 1 },
        actorUserId: actorId,
        requestId: actor.requestId,
      });
    });
    const decrypt = createExportDecryptStream(readExportDecryptionKeys());
    const source = createReadStream(file);
    source.on('error', (error) => decrypt.destroy(error));
    return { stream: source.pipe(decrypt), filename: `izvoz-licnih-podataka-${row.id}.zip` };
  }

  /** Checks before asking for MFA, so a wrong request fails fast. */
  async assertDownloadable(id: string, actorUserId: string, now: Date = new Date()) {
    const row = await this.prisma.privacyExport.findUnique({
      where: { id },
      select: { id: true, status: true, expiresAt: true, requestedByUserId: true, subjectUserId: true, downloadCount: true },
    });
    if (row === null) throw new PrivacyError(privacyErrorCodes.notFound);
    if (row.requestedByUserId !== actorUserId) throw new PrivacyError(privacyErrorCodes.forbidden);
    if (row.status === 'EXPIRED' || (row.expiresAt !== null && row.expiresAt <= now)) {
      throw new PrivacyError(privacyErrorCodes.exportExpired);
    }
    if (row.status !== 'READY') throw new PrivacyError(privacyErrorCodes.exportNotReady);
    return row;
  }

  /** Worker: builds one export. A crashed run (RUNNING > 30 min) is taken over. */
  async execute(id: string, now: Date = new Date()): Promise<ExportSummary | null> {
    const claimed = await this.prisma.privacyExport.updateMany({
      where: {
        id,
        OR: [
          { status: 'QUEUED' },
          { status: 'RUNNING', updatedAt: { lt: new Date(now.getTime() - privacyLimits.staleJobMs) } },
        ],
      },
      data: { status: 'RUNNING', error: null },
    });
    if (claimed.count === 0) return null;
    const temporary = path.join(this.root, `${id}.part`);
    try {
      const key = readExportMasterKey();
      if (key === null) throw new Error('export_key_missing');
      const row = await this.prisma.privacyExport.findUniqueOrThrow({
        where: { id },
        select: {
          subjectUserId: true,
          includeAttachments: true,
          includeInternalNotes: true,
          requestedByUserId: true,
        },
      });
      const requester =
        row.requestedByUserId === null
          ? null
          : await this.prisma.user.findUnique({ where: { id: row.requestedByUserId }, select: { displayName: true } });
      const configuration = await this.configurationLoader.load();
      const { zip, summary } = await this.builder.build({
        subjectUserId: row.subjectUserId,
        includeAttachments: row.includeAttachments,
        includeInternalNotes: row.includeInternalNotes,
        maxAttachmentBytes: configuration.exportMaxAttachmentBytes,
        exportedByName: requester?.displayName ?? 'system',
        now,
      });
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await pipeline(
        zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } }),
        createExportEncryptStream(key),
        createWriteStream(temporary, { mode: 0o600 }),
      );
      await rename(temporary, this.filePath(id));
      const { size } = await stat(this.filePath(id));
      const completedAt = new Date();
      await this.prisma.privacyExport.update({
        where: { id },
        data: {
          status: 'READY',
          storageKey: `${id}.hdx`,
          sizeBytes: Math.min(size, 2_147_483_647),
          completedAt,
          expiresAt: new Date(completedAt.getTime() + configuration.exportLinkValidDays * 86_400_000),
        },
      });
      return summary;
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`privacy_export_failed export=${id} reason=${message}`);
      await this.prisma.privacyExport.update({ where: { id }, data: { status: 'FAILED', error: message.slice(0, 1000) } });
      return null;
    }
  }

  /** Worker: expire links (the file is deleted) and resume forgotten jobs. Returns ids to (re)queue. */
  async maintain(now: Date = new Date()): Promise<string[]> {
    const expired = await this.prisma.privacyExport.findMany({
      where: { status: 'READY', expiresAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    for (const row of expired) {
      await unlink(this.filePath(row.id)).catch(() => undefined);
      await this.prisma.privacyExport.update({ where: { id: row.id }, data: { status: 'EXPIRED', storageKey: null } });
    }
    const pending = await this.prisma.privacyExport.findMany({
      where: {
        OR: [
          { status: 'QUEUED', updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
          { status: 'RUNNING', updatedAt: { lt: new Date(now.getTime() - privacyLimits.staleJobMs) } },
        ],
      },
      select: { id: true },
      take: 5,
    });
    return pending.map((row) => row.id);
  }

  private filePath(id: string): string {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error('invalid_export_id');
    return path.join(this.root, `${id}.hdx`);
  }

  private async toViews(rows: ExportRow[], actorUserId: string): Promise<ExportView[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.subjectUserId))] } },
      select: { id: true, displayName: true },
    });
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      id: row.id,
      subjectUserId: row.subjectUserId,
      subjectName: names.get(row.subjectUserId) ?? '—',
      requestId: row.requestId,
      status: row.status as ExportStatus,
      includeAttachments: row.includeAttachments,
      includeInternalNotes: row.includeInternalNotes,
      sizeBytes: row.sizeBytes,
      downloadCount: row.downloadCount,
      error: row.error,
      requestedByUserId: row.requestedByUserId,
      canDownload: row.status === 'READY' && row.requestedByUserId === actorUserId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }
}
