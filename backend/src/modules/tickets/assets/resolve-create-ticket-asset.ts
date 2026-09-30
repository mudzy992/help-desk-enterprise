import { PrismaService } from '../../../common/prisma/prisma.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';

export type CreateTicketAsset = { readonly id: string; readonly assetTag: string };

const selectableStatuses = ['IN_USE', 'IN_REPAIR'] as const;

async function readFlag(prisma: PrismaService, key: string, fallback: boolean): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  return row === null ? fallback : row.value === true;
}

/**
 * Paket 3.2 (§8): "Which equipment is this about?" on the create form. Only
 * equipment assigned to the requester, in use or in repair, of a type the
 * user may pick, while the CMDB module and the picker are on.
 */
export async function resolveCreateTicketAsset(
  prisma: PrismaService,
  assetId: string | undefined,
  requesterId: string,
): Promise<CreateTicketAsset | null> {
  const id = assetId?.trim();
  if (id === undefined || id.length === 0) return null;
  const enabled =
    (await readFlag(prisma, settingKeys.privateAddonsCmdb, false)) &&
    (await readFlag(prisma, settingKeys.privateAssetsTicketPickerEnabled, true));
  if (!enabled) throw new TicketsError('ASSET_NOT_SELECTABLE');
  const asset = await prisma.asset.findFirst({
    where: {
      id,
      assignedUserId: requesterId,
      retiredAt: null,
      status: { in: [...selectableStatuses] },
      type: { isUserSelectable: true },
    },
    select: { id: true, assetTag: true },
  });
  if (asset === null) throw new TicketsError('ASSET_NOT_SELECTABLE');
  return asset;
}

/** Inside the create transaction: the link, the asset history row and the ticket event. */
export async function linkCreatedTicketAsset(
  transaction: PrismaService,
  input: { readonly ticketId: string; readonly ticketNumber: string; readonly asset: CreateTicketAsset; readonly actorUserId: string },
) {
  await transaction.ticketAsset.create({
    data: { ticketId: input.ticketId, assetId: input.asset.id, isPrimary: true, linkedByUserId: input.actorUserId },
  });
  await transaction.assetEvent.create({
    data: {
      assetId: input.asset.id,
      action: 'ticket_linked',
      actorUserId: input.actorUserId,
      detail: { ticketId: input.ticketId, ticketNumber: input.ticketNumber, source: 'create' },
    },
  });
}
