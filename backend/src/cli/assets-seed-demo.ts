import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

/*
  Paket 3.2 (§15): demo inventory for trying the module out (also while it is
  switched off — the data waits for the activation).

    docker exec -i "$BACKEND" node dist/src/cli/assets-seed-demo.js [--remove]

  Everything it creates is marked: assets have tag `DEMO-…`, source IMPORT and
  notes "DEMO"; locations have code `DEMO-…`; licences and contracts have notes
  "DEMO". `--remove` deletes exactly those rows (hard delete — they are demo),
  including their links, events, assignments and ticket links.
*/

const marker = 'DEMO';
const day = 86_400_000;

type Created = { id: string; tag: string; typeKey: string; userId: string | null };

async function remove(prisma: PrismaClient): Promise<void> {
  const assets = await prisma.asset.findMany({ where: { notes: marker, assetTag: { startsWith: 'DEMO-' } }, select: { id: true } });
  const assetIds = assets.map((asset) => asset.id);
  const licenses = await prisma.softwareLicense.findMany({ where: { notes: marker }, select: { id: true } });
  const contracts = await prisma.assetContract.findMany({ where: { notes: marker }, select: { id: true } });
  await prisma.$transaction([
    prisma.licenseAssignment.deleteMany({ where: { OR: [{ licenseId: { in: licenses.map((row) => row.id) } }, { assetId: { in: assetIds } }] } }),
    prisma.softwareLicense.deleteMany({ where: { id: { in: licenses.map((row) => row.id) } } }),
    prisma.assetContractItem.deleteMany({ where: { OR: [{ contractId: { in: contracts.map((row) => row.id) } }, { assetId: { in: assetIds } }] } }),
    prisma.assetContract.deleteMany({ where: { id: { in: contracts.map((row) => row.id) } } }),
    prisma.assetRelation.deleteMany({ where: { OR: [{ fromAssetId: { in: assetIds } }, { toAssetId: { in: assetIds } }] } }),
    prisma.ticketAsset.deleteMany({ where: { assetId: { in: assetIds } } }),
    prisma.assetEvent.deleteMany({ where: { assetId: { in: assetIds } } }),
    prisma.asset.deleteMany({ where: { id: { in: assetIds } } }),
  ]);
  // Children first (the tree is Restrict on delete).
  for (let pass = 0; pass < 6; pass += 1) {
    const locations = await prisma.assetLocation.findMany({ where: { code: { startsWith: 'DEMO-' }, children: { none: {} }, assets: { none: {} } }, select: { id: true } });
    if (locations.length === 0) break;
    await prisma.assetLocation.deleteMany({ where: { id: { in: locations.map((row) => row.id) } } });
  }
  console.log(`Removed ${assetIds.length} demo assets, ${licenses.length} licences, ${contracts.length} contracts and the DEMO locations.`);
}

async function seed(prisma: PrismaClient): Promise<number> {
  if ((await prisma.asset.count({ where: { notes: marker, assetTag: { startsWith: 'DEMO-' } } })) > 0) {
    console.log('Demo inventory already exists. Run with --remove first to recreate it.');
    return 0;
  }
  const types = new Map((await prisma.assetType.findMany({ select: { id: true, key: true } })).map((type) => [type.key, type.id]));
  const units = await prisma.organizationalUnit.findMany({ select: { id: true, parentId: true, ouPath: true }, orderBy: { ouPath: 'asc' }, take: 50 });
  const root = units.find((unit) => unit.parentId === null) ?? units[0];
  if (!root) {
    console.error('No organisational unit exists yet.');
    return 1;
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
        notes: marker,
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
    data: { productName: 'Windows 11 Pro', vendor: 'Microsoft', kind: 'PER_DEVICE', seats: 25, cost: new Prisma.Decimal(6250), notes: marker, organizationalUnitId: root.id },
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
      notes: marker,
      organizationalUnitId: root.id,
    },
  });
  await prisma.licenseAssignment.createMany({ data: assignedPeople.map((userId) => ({ licenseId: m365.id, userId })) });
  const acrobat = await prisma.softwareLicense.create({
    data: { productName: 'Adobe Acrobat Pro', vendor: 'Adobe', kind: 'SUBSCRIPTION', seats: 5, validUntil: date(25), notes: marker, organizationalUnitId: root.id },
  });
  await prisma.licenseAssignment.createMany({ data: people.slice(0, 2).map((userId) => ({ licenseId: acrobat.id, userId })) });
  await prisma.softwareLicense.create({
    data: { productName: '7-Zip', vendor: 'Igor Pavlov', kind: 'SITE', seats: null, notes: marker, organizationalUnitId: root.id },
  });

  // Contracts: warranty extension ending in 20 days, server maintenance for a year.
  const warranty = await prisma.assetContract.create({
    data: { kind: 'WARRANTY', supplier: 'Dell ProSupport', reference: 'DEMO-PS-2024-117', startsAt: date(-345), endsAt: date(20), cost: new Prisma.Decimal(2400), notes: marker, organizationalUnitId: root.id },
  });
  await prisma.assetContractItem.createMany({ data: created.filter((entry) => entry.typeKey === 'laptop').slice(0, 6).map((entry) => ({ contractId: warranty.id, assetId: entry.id })) });
  const maintenance = await prisma.assetContract.create({
    data: { kind: 'MAINTENANCE', supplier: 'Demo Servis d.o.o.', reference: 'DEMO-OD-2026-04', startsAt: date(-65), endsAt: date(300), cost: new Prisma.Decimal(9600), notes: marker, organizationalUnitId: root.id },
  });
  if (server) await prisma.assetContractItem.create({ data: { contractId: maintenance.id, assetId: server.id } });

  // Up to 3 existing tickets of the e2e user linked to their laptop (incident history).
  const firstLaptop = created.find((entry) => entry.typeKey === 'laptop' && entry.userId !== null);
  if (firstLaptop?.userId) {
    const tickets = await prisma.ticket.findMany({ where: { requesterId: firstLaptop.userId }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 3 });
    if (tickets.length > 0) {
      await prisma.ticketAsset.createMany({ data: tickets.map((ticket, index) => ({ ticketId: ticket.id, assetId: firstLaptop.id, isPrimary: index === 0 })), skipDuplicates: true });
    }
  }

  console.log(`Seeded ${created.length} demo assets, 4 locations, 4 licences (Microsoft 365 over-allocated, Acrobat ends in 25 days) and 2 contracts (warranty ends in 20 days).`);
  console.log(`Unit: ${root.ouPath}${child.id !== root.id ? ` and ${child.ouPath}` : ''}; assigned to ${people.length} user(s)${e2eUser ? ' incl. e2e.user@example.com' : ''}.`);
  return 0;
}

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (process.argv.includes('--remove')) {
      await remove(prisma);
      return 0;
    }
    return await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
