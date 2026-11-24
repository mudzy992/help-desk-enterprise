import { Prisma, PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { lockTicketAssetPrimaryGroups } from '../modules/assets/asset-ticket-primary-lock';
import {
  appendCliCommandAudit,
  recordCliCommandAudit,
  type CliCommandAuditInput,
} from './safety/cli-operator-audit';

/*
  Paket 3.2 (§15), predat W1.5 (`BA-xcut-08`): the demo inventory itself.

  The CLI used to own both the data and the decision to write it. It now owns
  neither: this module only knows how to seed and how to remove, and returns the
  counts it committed instead of printing them. Every guard (target, environment,
  reason, operator, confirmation) lives in `./safety/*`, so the same body can be
  executed by a test with no arguments and no stdout to parse.

  Everything it creates is marked: assets have tag `DEMO-…`, source IMPORT and
  notes „DEMO”; locations have code `DEMO-…`; licences and contracts have notes
  „DEMO”. Removal hard-deletes only unreferenced demo assets and empty
  demo-owned objects; an asset a ticket/transfer still references is **retained**
  and reported, so the run never unlinks business history silently. Asset events
  are retained as detached history with the original asset identity.
*/

export const demoMarker = 'DEMO';
const day = 86_400_000;

type Created = { id: string; tag: string; typeKey: string; userId: string | null };

/** The numbers a run committed; they are what the audit row carries. */
export type DemoCounts = Readonly<{
  assets: number;
  locations: number;
  licenses: number;
  contracts: number;
}>;

export type DemoSeedResult = DemoCounts &
  Readonly<{
    /** The DB already held demo artifacts, so nothing was written. */
    alreadyPresent: boolean;
    unitPath: string | null;
    assignedUsers: number;
    /** Seed needs these asset types; missing ones are skipped, not invented. */
    missingAssetTypes: readonly string[];
    linkedTickets: number;
  }>;

export type DemoRemovalResult = DemoCounts &
  Readonly<{
    totalDemoAssets: number;
    /** Demo assets a ticket/transfer/problem/change still references: kept, and reported. */
    retainedReferencedAssets: number;
    /** Demo licences still assigned to people: kept (removing them would unlink users), and reported. */
    retainedLicenses: number;
    /** Demo contracts that still have items: kept, and reported. */
    retainedContracts: number;
  }>;

/**
 * Deletes the demo inventory inside the caller's transaction, so the audit row
 * and the deletes commit together.
 *
 * A demo asset that a ticket still references is *not* deleted: `TicketAsset`
 * is `onDelete: Restrict`, and the seed links the e2e user's tickets to their
 * laptop on purpose. Deleting the rest and reporting the retained ones keeps the
 * command usable and the business history intact — the alternative (letting the
 * FK abort the whole run) would make `--remove` fail on exactly the data the
 * seed itself created.
 */
export async function removeDemoInventory(transaction: Prisma.TransactionClient): Promise<DemoRemovalResult> {
  const demoAssets = await transaction.asset.findMany({
    where: { notes: demoMarker, assetTag: { startsWith: 'DEMO-' } },
    select: {
      id: true,
      // Business references: deleting such an asset would unlink a ticket, a
      // transfer, a problem or a change. Those stay, and the operator is told.
      tickets: { select: { ticketId: true }, take: 1 },
      transferItems: { select: { id: true }, take: 1 },
      problems: { select: { problemId: true }, take: 1 },
      changes: { select: { changeId: true }, take: 1 },
    },
  });
  const isBusinessReferenced = (asset: (typeof demoAssets)[number]): boolean =>
    asset.tickets.length > 0 ||
    asset.transferItems.length > 0 ||
    asset.problems.length > 0 ||
    asset.changes.length > 0;
  const removable = demoAssets.filter((asset) => !isBusinessReferenced(asset)).map((asset) => asset.id);

  /*
    W1.5: the demo graph itself (licence assignments, contract items, relations)
    has to go before the assets, or the database guard
    (`Asset_hard_delete_dependencies`, W7.15) refuses every delete — the old
    command deleted assets first, so a seeded inventory could not be removed at
    all. Only rows that point at a *removable* demo asset are touched; a relation
    to a real asset is dropped, the real asset is not.
  */
  if (removable.length > 0) {
    await transaction.licenseAssignment.deleteMany({ where: { assetId: { in: removable } } });
    await transaction.assetContractItem.deleteMany({ where: { assetId: { in: removable } } });
    await transaction.assetRelation.deleteMany({
      where: { OR: [{ fromAssetId: { in: removable } }, { toAssetId: { in: removable } }] },
    });
  }
  const assets = removable.length === 0 ? { count: 0 } : await transaction.asset.deleteMany({ where: { id: { in: removable } } });

  // Delete only standalone demo-owned business objects, never their links.
  const [licenses, contracts, retainedLicences, retainedContracts] = await Promise.all([
    transaction.softwareLicense.deleteMany({ where: { notes: demoMarker, assignments: { none: {} } } }),
    transaction.assetContract.deleteMany({ where: { notes: demoMarker, items: { none: {} } } }),
    // Assignments to people are not demo-graph links: unlinking a person is a
    // business decision, so those licences stay and are reported instead.
    transaction.softwareLicense.count({ where: { notes: demoMarker, assignments: { some: {} } } }),
    transaction.assetContract.count({ where: { notes: demoMarker, items: { some: {} } } }),
  ]);

  // Children first (the tree is Restrict on delete).
  let locations = 0;
  for (let pass = 0; pass < 6; pass += 1) {
    const batch = await transaction.assetLocation.findMany({ where: { code: { startsWith: 'DEMO-' }, children: { none: {} }, assets: { none: {} } }, select: { id: true } });
    if (batch.length === 0) break;
    locations += (await transaction.assetLocation.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } })).count;
  }

  return {
    assets: assets.count,
    locations,
    licenses: licenses.count,
    contracts: contracts.count,
    totalDemoAssets: demoAssets.length,
    retainedReferencedAssets: demoAssets.length - removable.length,
    retainedLicenses: retainedLicences,
    retainedContracts: retainedContracts,
  };
}

/**
 * The whole removal as one transaction: the `completed` audit row is written
 * inside it, so a failure anywhere leaves no deletes and no claim of one.
 */
export async function runDemoRemoval(
  prisma: PrismaClient,
  audit: Omit<CliCommandAuditInput, 'outcome' | 'counts'>,
): Promise<DemoRemovalResult> {
  return prisma.$transaction(async (transaction) => {
    const result = await removeDemoInventory(transaction);
    await appendCliCommandAudit(transaction, {
      ...audit,
      outcome: 'completed',
      counts: {
        assets: result.assets,
        locations: result.locations,
        licenses: result.licenses,
        contracts: result.contracts,
        retainedAssets: result.retainedReferencedAssets,
        retainedLicenses: result.retainedLicenses,
        retainedContracts: result.retainedContracts,
      },
    });
    return result;
  });
}

/** Asset types the demo inventory needs; a missing type is reported, never invented. */
export const demoAssetTypeKeys = [
  'laptop',
  'computer',
  'monitor',
  'printer',
  'phone',
  'server',
  'virtual-machine',
  'application',
  'network-device',
  'peripheral',
] as const;

export class DemoInventoryError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'DemoInventoryError';
  }
}

const emptySeedResult = (): DemoSeedResult => ({
  assets: 0,
  locations: 0,
  licenses: 0,
  contracts: 0,
  alreadyPresent: true,
  unitPath: null,
  assignedUsers: 0,
  missingAssetTypes: [],
  linkedTickets: 0,
});

/** Read-only: what a dry run reports without touching anything. */
export async function planDemoInventory(prisma: PrismaClient): Promise<{
  readonly alreadyPresent: boolean;
  readonly demoAssets: number;
  readonly removableAssets: number;
  readonly retainedAssets: number;
  readonly demoLocations: number;
  readonly demoLicenses: number;
  readonly demoContracts: number;
  readonly unitPath: string | null;
  readonly missingAssetTypes: readonly string[];
}> {
  const [assets, locations, licenses, contracts, types, unit] = await Promise.all([
    prisma.asset.findMany({
      where: { notes: demoMarker, assetTag: { startsWith: 'DEMO-' } },
      select: { tickets: { select: { ticketId: true }, take: 1 } },
    }),
    prisma.assetLocation.count({ where: { code: { startsWith: 'DEMO-' } } }),
    prisma.softwareLicense.count({ where: { notes: demoMarker } }),
    prisma.assetContract.count({ where: { notes: demoMarker } }),
    prisma.assetType.findMany({ select: { key: true } }),
    prisma.organizationalUnit.findFirst({
      where: { parentId: null },
      select: { ouPath: true },
      orderBy: { ouPath: 'asc' },
    }),
  ]);
  const known = new Set(types.map((type) => type.key));
  const retained = assets.filter((asset) => asset.tickets.length > 0).length;
  return {
    alreadyPresent: assets.length > 0 || locations > 0 || licenses > 0 || contracts > 0,
    demoAssets: assets.length,
    removableAssets: assets.length - retained,
    retainedAssets: retained,
    demoLocations: locations,
    demoLicenses: licenses,
    demoContracts: contracts,
    unitPath: unit?.ouPath ?? null,
    missingAssetTypes: demoAssetTypeKeys.filter((key) => !known.has(key)),
  };
}

export async function seedDemoInventory(prisma: PrismaClient): Promise<DemoSeedResult> {
  const existingDemoArtifacts = await Promise.all([
    prisma.asset.count({ where: { notes: demoMarker, assetTag: { startsWith: 'DEMO-' } } }),
    prisma.assetLocation.count({ where: { code: { startsWith: 'DEMO-' } } }),
    prisma.softwareLicense.count({ where: { notes: demoMarker } }),
    prisma.assetContract.count({ where: { notes: demoMarker } }),
  ]);
  if (existingDemoArtifacts.some((count) => count > 0)) {
    return emptySeedResult();
  }
  const types = new Map((await prisma.assetType.findMany({ select: { id: true, key: true } })).map((type) => [type.key, type.id]));
  const missingAssetTypes = demoAssetTypeKeys.filter((key) => !types.has(key));
  const units = await prisma.organizationalUnit.findMany({ select: { id: true, parentId: true, ouPath: true }, orderBy: { ouPath: 'asc' }, take: 50 });
  const root = units.find((unit) => unit.parentId === null) ?? units[0];
  if (!root) {
    throw new DemoInventoryError('DEMO_SEED_NO_ORGANIZATIONAL_UNIT');
  }
  const child = units.find((unit) => unit.parentId === root.id) ?? root;
  const e2eUser = await prisma.user.findUnique({ where: { email: 'e2e.user@example.com' }, select: { id: true } });
  const others = await prisma.user.findMany({
    where: { isActive: true, anonymizedAt: null, isLocalOnly: false, ...(e2eUser ? { id: { not: e2eUser.id } } : {}) },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 6,
  });
  const people = [...(e2eUser ? [e2eUser.id] : []), ...others.map((user) => user.id)];
  const now = Date.now();
  const date = (offsetDays: number) => new Date(Math.floor((now + offsetDays * day) / day) * day);

  const building = await prisma.assetLocation.create({ data: { name: 'Demo zgrada', code: 'DEMO-B1', sortOrder: 900 } });
  const office = await prisma.assetLocation.create({ data: { name: 'Kancelarija 12', code: 'DEMO-B1-12', parentId: building.id } });
  const serverRoom = await prisma.assetLocation.create({ data: { name: 'Server sala', code: 'DEMO-B1-SR', parentId: building.id } });
  const storage = await prisma.assetLocation.create({ data: { name: 'Skladište IT', code: 'DEMO-B1-SK', parentId: building.id } });

  const created: Created[] = [];
  let sequence = 1;
  const add = async (typeKey: string, name: string, extra: Partial<Prisma.AssetUncheckedCreateInput> & { attributes?: Record<string, unknown> } = {}) => {
    const typeId = types.get(typeKey);
    if (!typeId) return null;
    const tag = `DEMO-${String(sequence++).padStart(4, '0')}`;
    const userId = (extra.assignedUserId as string | null | undefined) ?? null;
    const row = await prisma.asset.create({
      data: {
        assetTag: tag,
        typeId,
        name,
        status: userId ? 'IN_USE' : 'IN_STOCK',
        organizationalUnitId: root.id,
        source: 'IMPORT',
        notes: demoMarker,
        assignedAt: userId ? new Date() : null,
        ...extra,
        attributes: (extra.attributes ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await prisma.assetEvent.create({ data: { assetId: row.id, action: 'imported', detail: { demo: true, assetTag: tag } } });
    const entry = { id: row.id, tag, typeKey, userId };
    created.push(entry);
    return entry;
  };

  const models = ['Dell Latitude 5440', 'HP EliteBook 840 G10', 'Lenovo ThinkPad T14'];
  for (let index = 0; index < 12; index += 1) {
    const userId = index < people.length ? people[index] : null;
    await add('laptop', `${models[index % models.length]}`, {
      manufacturer: models[index % models.length].split(' ')[0],
      model: models[index % models.length].split(' ').slice(1).join(' '),
      serialNumber: `DEMO-SN-L${1000 + index}`,
      assignedUserId: userId,
      organizationalUnitId: index % 2 === 0 ? root.id : child.id,
      locationId: userId ? office.id : storage.id,
      purchaseDate: date(-400 + index * 10),
      purchaseCost: new Prisma.Decimal(1450 + index * 15),
      currency: 'BAM',
      supplier: 'Demo Distribucija d.o.o.',
      // A few warranties inside the reminder window (7 / 30 / 60 days).
      warrantyEndsAt: date([5, 25, 55, 400][index % 4]),
      attributes: { cpu: 'Intel Core i5', ramGb: 16, diskGb: 512, os: 'Windows 11 Pro', hostname: `DEMO-LT-${String(index + 1).padStart(2, '0')}` },
    });
  }
  for (let index = 0; index < 8; index += 1) {
    await add('computer', 'Dell OptiPlex 7010', {
      manufacturer: 'Dell',
      model: 'OptiPlex 7010',
      serialNumber: `DEMO-SN-C${2000 + index}`,
      assignedUserId: index + 1 < people.length ? people[index + 1] : null,
      locationId: office.id,
      warrantyEndsAt: date(200 + index * 20),
      attributes: { cpu: 'Intel Core i7', ramGb: 32, diskGb: 1024, os: 'Windows 11 Pro', hostname: `DEMO-PC-${String(index + 1).padStart(2, '0')}` },
    });
  }
  for (let index = 0; index < 8; index += 1) {
    await add('monitor', index % 2 ? 'Dell P2423D' : 'LG 27UP850', {
      serialNumber: `DEMO-SN-M${3000 + index}`,
      assignedUserId: index < people.length ? people[index] : null,
      locationId: office.id,
      attributes: { sizeInch: index % 2 ? 24 : 27 },
    });
  }
  for (let index = 0; index < 3; index += 1) {
    await add('printer', `HP LaserJet MFP M42${index}`, { locationId: office.id, attributes: { ipAddress: `10.0.20.${30 + index}`, tonerModel: 'HP 59A', color: index === 0 } });
  }
  for (let index = 0; index < 4; index += 1) {
    await add('phone', 'Samsung Galaxy A55', {
      assignedUserId: index < people.length ? people[index] : null,
      attributes: { imei: `35999900000${String(index).padStart(4, '0')}`, phoneNumber: `+38761000${String(index).padStart(3, '0')}` },
    });
  }
  const server = await add('server', 'Demo host HV-01', {
    manufacturer: 'Dell',
    model: 'PowerEdge R650',
    serialNumber: 'DEMO-SN-S1',
    locationId: serverRoom.id,
    warrantyEndsAt: date(300),
    attributes: { ipAddress: '10.0.10.11', os: 'Windows Server 2022', environment: 'production' },
  });
  const vm = await add('virtual-machine', 'Demo VM APP-01', { attributes: { ipAddress: '10.0.10.51', environment: 'production' } });
  const app = await add('application', 'Demo ERP', { attributes: { version: '2026.3', url: 'https://erp.example.com' } });
  await add('network-device', 'Demo switch SW-01', { locationId: serverRoom.id, attributes: { ipAddress: '10.0.0.2' } });
  await add('peripheral', 'Logitech MX Keys', { locationId: storage.id });

  if (server && vm && app) {
    await prisma.assetRelation.createMany({
      data: [
        { fromAssetId: vm.id, toAssetId: server.id, kind: 'RUNS_ON' },
        { fromAssetId: app.id, toAssetId: vm.id, kind: 'RUNS_ON' },
      ],
    });
  }

  // Licences: one per device, one per user and over-allocated, one expiring subscription.
  const devices = created.filter((entry) => entry.typeKey === 'laptop' || entry.typeKey === 'computer');
  const windows = await prisma.softwareLicense.create({
    data: { productName: 'Windows 11 Pro', vendor: 'Microsoft', kind: 'PER_DEVICE', seats: 25, cost: new Prisma.Decimal(6250), notes: demoMarker, organizationalUnitId: root.id },
  });
  await prisma.licenseAssignment.createMany({ data: devices.slice(0, 15).map((entry) => ({ licenseId: windows.id, assetId: entry.id })) });
  const assignedPeople = people.slice(0, 5);
  const m365 = await prisma.softwareLicense.create({
    data: {
      productName: 'Microsoft 365 Business Standard',
      vendor: 'Microsoft',
      kind: 'PER_USER',
      seats: Math.max(assignedPeople.length - 1, 0),
      validUntil: date(340),
      notes: demoMarker,
      organizationalUnitId: root.id,
    },
  });
  await prisma.licenseAssignment.createMany({ data: assignedPeople.map((userId) => ({ licenseId: m365.id, userId })) });
  const acrobat = await prisma.softwareLicense.create({
    data: { productName: 'Adobe Acrobat Pro', vendor: 'Adobe', kind: 'SUBSCRIPTION', seats: 5, validUntil: date(25), notes: demoMarker, organizationalUnitId: root.id },
  });
  await prisma.licenseAssignment.createMany({ data: people.slice(0, 2).map((userId) => ({ licenseId: acrobat.id, userId })) });
  const sevenZip = await prisma.softwareLicense.create({
    data: { productName: '7-Zip', vendor: 'Igor Pavlov', kind: 'SITE', seats: null, notes: demoMarker, organizationalUnitId: root.id },
  });

  // Contracts: warranty extension ending in 20 days, server maintenance for a year.
  const warranty = await prisma.assetContract.create({
    data: { kind: 'WARRANTY', supplier: 'Dell ProSupport', reference: 'DEMO-PS-2024-117', startsAt: date(-345), endsAt: date(20), cost: new Prisma.Decimal(2400), notes: demoMarker, organizationalUnitId: root.id },
  });
  await prisma.assetContractItem.createMany({ data: created.filter((entry) => entry.typeKey === 'laptop').slice(0, 6).map((entry) => ({ contractId: warranty.id, assetId: entry.id })) });
  const maintenance = await prisma.assetContract.create({
    data: { kind: 'MAINTENANCE', supplier: 'Demo Servis d.o.o.', reference: 'DEMO-OD-2026-04', startsAt: date(-65), endsAt: date(300), cost: new Prisma.Decimal(9600), notes: demoMarker, organizationalUnitId: root.id },
  });
  if (server) await prisma.assetContractItem.create({ data: { contractId: maintenance.id, assetId: server.id } });

  // Up to 3 existing tickets of the e2e user linked to their laptop (incident history).
  const firstLaptop = created.find((entry) => entry.typeKey === 'laptop' && entry.userId !== null);
  let linkedTickets = 0;
  if (firstLaptop?.userId) {
    const tickets = await prisma.ticket.findMany({ where: { requesterId: firstLaptop.userId }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 3 });
    if (tickets.length > 0) {
      linkedTickets = tickets.length;
      await prisma.$transaction(async (transaction) => {
        await lockTicketAssetPrimaryGroups(
          transaction as unknown as Pick<PrismaService, '$queryRaw'>,
          tickets.map((ticket) => ticket.id),
        );
        for (const ticket of tickets) {
          const existing = await transaction.ticketAsset.findUnique({
            where: { ticketId_assetId: { ticketId: ticket.id, assetId: firstLaptop.id } },
          });
          if (existing !== null) continue;
          const currentPrimary = await transaction.ticketAsset.findFirst({
            where: { ticketId: ticket.id, isPrimary: true },
            select: { assetId: true },
          });
          await transaction.ticketAsset.create({
            data: {
              ticketId: ticket.id,
              assetId: firstLaptop.id,
              isPrimary: currentPrimary === null,
            },
          });
        }
      });
    }
  }

  return {
    assets: created.length,
    locations: [building, office, serverRoom, storage].length,
    licenses: [windows, m365, acrobat, sevenZip].length,
    contracts: [warranty, maintenance].length,
    alreadyPresent: false,
    unitPath: root.ouPath,
    assignedUsers: people.length,
    missingAssetTypes,
    linkedTickets,
  };
}

/**
 * A seed run: `started` before the first write (fail-closed), the inventory, then
 * `completed` with the counts. The seed is deliberately *not* one transaction —
 * it is a long demo script and a single huge transaction would hold locks for its
 * whole duration; a crash therefore leaves the `started` row and a partial
 * inventory, which is exactly what the operator needs to see to run `--remove`.
 */
export async function runDemoSeed(
  prisma: PrismaClient,
  audit: Omit<CliCommandAuditInput, 'outcome' | 'counts'>,
): Promise<DemoSeedResult> {
  await recordCliCommandAudit(prisma, { ...audit, outcome: 'started' });
  const result = await seedDemoInventory(prisma);
  if (!result.alreadyPresent) {
    await recordCliCommandAudit(prisma, {
      ...audit,
      outcome: 'completed',
      counts: {
        assets: result.assets,
        locations: result.locations,
        licenses: result.licenses,
        contracts: result.contracts,
        linkedTickets: result.linkedTickets,
      },
    });
  }
  return result;
}
