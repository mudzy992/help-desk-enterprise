import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { mapTicketError } from '../tickets/map-ticket-error';
import { publishPersistedTicketMessages } from '../tickets/publish-persisted-ticket-messages';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import type { TicketPersistedMessageSink } from '../tickets/collaboration.types';
import type { TicketRecord } from '../tickets/tickets.types';
import { AssetAccessService } from './asset-access.service';
import { isPathInScope, viewerHasPermission, type AssetViewer } from './asset-viewer';
import { AssetError, assetErrorCodes } from './assets.constants';

/** Ticket statuses after which the equipment panel is read-only. */
const readOnlyTicketStatuses = new Set(['CLOSED', 'ARCHIVED']);
const pickerStatuses = ['IN_USE', 'IN_REPAIR'] as const;
export const ticketAssetLinkLimit = 20;

export type TicketAssetItem = {
  readonly assetId: string;
  readonly assetTag: string;
  readonly name: string;
  readonly typeName: string;
  readonly typeNameEn: string;
  readonly typeIcon: string;
  readonly status: string;
  readonly isPrimary: boolean;
  readonly linkedAt: string;
  /** The viewer may open the asset card (read scope). */
  readonly canOpen: boolean;
};

export type TicketAssetsView = {
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly items: readonly TicketAssetItem[];
};

/**
 * Paket 3.2 (§8): equipment on a ticket. Staff on the ticket (who hold
 * `asset.read`) see and edit the panel; the requester sees the linked
 * equipment in a plain form. Links, unlinks and the primary flag are internal
 * system events on the ticket and history rows on the asset.
 */
@Injectable()
export class AssetTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  /** Create form: the requester's own equipment (§8). */
  async picker(viewer: AssetViewer) {
    const enabled =
      (await this.access.isEnabled()) &&
      (await this.access.readSetting<boolean>(settingKeys.privateAssetsTicketPickerEnabled, true)) === true;
    if (!enabled) return { enabled: false, items: [] };
    const rows = await this.prisma.asset.findMany({
      where: {
        assignedUserId: viewer.userId,
        retiredAt: null,
        status: { in: [...pickerStatuses] },
        type: { isUserSelectable: true },
      },
      orderBy: [{ type: { sortOrder: 'asc' } }, { name: 'asc' }],
      take: 100,
      select: {
        id: true,
        assetTag: true,
        name: true,
        type: { select: { nameBs: true, nameEn: true, icon: true } },
      },
    });
    return {
      enabled: true,
      items: rows.map((row) => ({
        id: row.id,
        assetTag: row.assetTag,
        name: row.name,
        typeName: row.type.nameBs,
        typeNameEn: row.type.nameEn,
        typeIcon: row.type.icon,
      })),
    };
  }

  private async loadTicket(ticketId: string, viewer: AssetViewer, writable: boolean) {
    try {
      const gated = await this.accessPolicies.bind({ actorUserId: viewer.userId });
      return await loadAccessibleTicket(this.prisma, this.authorizationContextLoader, ticketId, gated, { writable });
    } catch (error) {
      throw mapTicketError(error);
    }
  }

  private canEdit(ticket: TicketRecord, staff: boolean, viewer: AssetViewer): boolean {
    return (
      staff &&
      viewerHasPermission(viewer, permissionKeys.assetRead) &&
      !readOnlyTicketStatuses.has(ticket.status) &&
      (ticket as { mergedIntoTicketId?: string | null }).mergedIntoTicketId == null
    );
  }

  async list(ticketId: string, viewer: AssetViewer): Promise<TicketAssetsView> {
    if (!(await this.access.isEnabled())) return { enabled: false, canEdit: false, items: [] };
    const { ticket, access } = await this.loadTicket(ticketId, viewer, false);
    const staff = access.visibility === 'staff';
    const readScope = viewerHasPermission(viewer, permissionKeys.assetRead)
      ? await this.access.scope(viewer, permissionKeys.assetRead)
      : null;
    const links = await this.prisma.ticketAsset.findMany({
      where: { ticketId: ticket.id },
      orderBy: [{ isPrimary: 'desc' }, { linkedAt: 'asc' }],
      include: {
        asset: {
          select: {
            id: true,
            assetTag: true,
            name: true,
            status: true,
            organizationalUnit: { select: { ouPath: true } },
            type: { select: { nameBs: true, nameEn: true, icon: true } },
          },
        },
      },
    });
    return {
      enabled: true,
      canEdit: this.canEdit(ticket, staff, viewer),
      items: links.map((link) => ({
        assetId: link.asset.id,
        assetTag: link.asset.assetTag,
        name: link.asset.name,
        typeName: link.asset.type.nameBs,
        typeNameEn: link.asset.type.nameEn,
        typeIcon: link.asset.type.icon,
        // The requester does not see the internal lifecycle status.
        status: staff ? link.asset.status : '',
        isPrimary: link.isPrimary,
        linkedAt: link.linkedAt.toISOString(),
        canOpen: staff && readScope !== null && isPathInScope(readScope, link.asset.organizationalUnit.ouPath),
      })),
    };
  }

  private async requireEditable(ticketId: string, viewer: AssetViewer) {
    await this.access.requireEnabled();
    const { ticket, access } = await this.loadTicket(ticketId, viewer, true);
    if (!this.canEdit(ticket, access.visibility === 'staff', viewer)) {
      throw new AssetError(assetErrorCodes.forbidden);
    }
    return ticket;
  }

  private async loadAssetInReadScope(assetId: string, viewer: AssetViewer) {
    const scope = await this.access.scope(viewer, permissionKeys.assetRead);
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, assetTag: true, name: true, organizationalUnit: { select: { ouPath: true } } },
    });
    if (asset === null || !isPathInScope(scope, asset.organizationalUnit.ouPath)) {
      throw new AssetError(assetErrorCodes.notFound);
    }
    return asset;
  }

  private async afterWrite(ticket: TicketRecord, messages: TicketPersistedMessageSink, audit: { action: string; assetId: string; viewer: AssetViewer }) {
    publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action: audit.action,
      entityType: auditLogEntityTypes.asset,
      entityId: audit.assetId,
      metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber } as never,
      actorUserId: audit.viewer.userId,
    });
  }

  async link(ticketId: string, input: { assetId: string; isPrimary?: boolean }, viewer: AssetViewer): Promise<TicketAssetsView> {
    const ticket = await this.requireEditable(ticketId, viewer);
    const asset = await this.loadAssetInReadScope(input.assetId, viewer);
    const messages: TicketPersistedMessageSink = [];
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.ticketAsset.findUnique({
        where: { ticketId_assetId: { ticketId: ticket.id, assetId: asset.id } },
      });
      if (existing !== null) throw new AssetError(assetErrorCodes.relationExists);
      const count = await transaction.ticketAsset.count({ where: { ticketId: ticket.id } });
      if (count >= ticketAssetLinkLimit) throw new AssetError(assetErrorCodes.invalid, 'limit');
      // The first link is primary; an explicit primary replaces the old one.
      const isPrimary = input.isPrimary === true || count === 0;
      if (isPrimary) {
        await transaction.ticketAsset.updateMany({ where: { ticketId: ticket.id }, data: { isPrimary: false } });
      }
      await transaction.ticketAsset.create({
        data: { ticketId: ticket.id, assetId: asset.id, isPrimary, linkedByUserId: viewer.userId },
      });
      await transaction.assetEvent.create({
        data: {
          assetId: asset.id,
          action: 'ticket_linked',
          actorUserId: viewer.userId,
          detail: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
        },
      });
      messages.push(
        await insertSystemTicketEvent(transaction as PrismaService, {
          ticketId: ticket.id,
          action: ticketSystemEventActions.assetLinked,
          actorUserId: viewer.userId,
          detail: `${asset.id}|${asset.assetTag} ${asset.name}`,
        }),
      );
    });
    await this.afterWrite(ticket, messages, { action: 'asset.ticket.linked', assetId: asset.id, viewer });
    return this.list(ticket.id, viewer);
  }

  async unlink(ticketId: string, assetId: string, viewer: AssetViewer): Promise<TicketAssetsView> {
    const ticket = await this.requireEditable(ticketId, viewer);
    const messages: TicketPersistedMessageSink = [];
    await this.prisma.$transaction(async (transaction) => {
      const link = await transaction.ticketAsset.findUnique({
        where: { ticketId_assetId: { ticketId: ticket.id, assetId } },
        include: { asset: { select: { assetTag: true, name: true } } },
      });
      if (link === null) throw new AssetError(assetErrorCodes.notFound);
      await transaction.ticketAsset.delete({ where: { ticketId_assetId: { ticketId: ticket.id, assetId } } });
      if (link.isPrimary) {
        // Keep one primary while links remain: the oldest one takes over.
        const next = await transaction.ticketAsset.findFirst({ where: { ticketId: ticket.id }, orderBy: { linkedAt: 'asc' } });
        if (next !== null) {
          await transaction.ticketAsset.update({
            where: { ticketId_assetId: { ticketId: ticket.id, assetId: next.assetId } },
            data: { isPrimary: true },
          });
        }
      }
      await transaction.assetEvent.create({
        data: {
          assetId,
          action: 'ticket_unlinked',
          actorUserId: viewer.userId,
          detail: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
        },
      });
      messages.push(
        await insertSystemTicketEvent(transaction as PrismaService, {
          ticketId: ticket.id,
          action: ticketSystemEventActions.assetUnlinked,
          actorUserId: viewer.userId,
          detail: `${assetId}|${link.asset.assetTag} ${link.asset.name}`,
        }),
      );
    });
    await this.afterWrite(ticket, messages, { action: 'asset.ticket.unlinked', assetId, viewer });
    return this.list(ticket.id, viewer);
  }

  async setPrimary(ticketId: string, assetId: string, viewer: AssetViewer): Promise<TicketAssetsView> {
    const ticket = await this.requireEditable(ticketId, viewer);
    await this.prisma.$transaction(async (transaction) => {
      const link = await transaction.ticketAsset.findUnique({ where: { ticketId_assetId: { ticketId: ticket.id, assetId } } });
      if (link === null) throw new AssetError(assetErrorCodes.notFound);
      await transaction.ticketAsset.updateMany({ where: { ticketId: ticket.id }, data: { isPrimary: false } });
      await transaction.ticketAsset.update({ where: { ticketId_assetId: { ticketId: ticket.id, assetId } }, data: { isPrimary: true } });
    });
    return this.list(ticket.id, viewer);
  }
}
