import { insert, seedId } from './context.mjs';

export async function seedAssets(client, context) {
  const unit = context.itUnitId;
  await insert(client, 'AssetLocation', {
    id: seedId('loc_hq'),
    name: 'Direkcija — server sala',
    code: 'SRV-01',
    sortOrder: 1,
  });
  await insert(client, 'AssetLocation', {
    id: seedId('loc_store'),
    name: 'IT magacin',
    code: 'MAG-IT',
    sortOrder: 2,
  });
  const visoko = context.requesters.find((user) => user.email.startsWith('korisnik.visoko'));
  const amar = context.user('amar.hodzic@test.epbih.lab');
  const rows = [
    ['laptop', 'LAP-1001', 'Laptop Lenovo T14 — Amar Hodžić', 'IN_USE', amar.id, null, 'HARDWARE'],
    ['laptop', 'LAP-1002', 'Laptop Dell Latitude — magacin', 'IN_STOCK', null, 'loc_store', 'HARDWARE'],
    ['laptop', 'LAP-1003', 'Laptop HP — servis tastature', 'IN_REPAIR', null, 'loc_store', 'HARDWARE'],
    ['laptop', 'LAP-0990', 'Laptop iz 2018 — rashod', 'RETIRED', null, null, 'HARDWARE'],
    ['computer', 'PC-2104', 'Radna stanica obračun, Visoko', 'IN_USE', visoko?.id ?? null, null, 'HARDWARE'],
    ['monitor', 'MON-3301', 'Dell 24" uz LAP-1001', 'IN_USE', amar.id, null, 'HARDWARE'],
    ['printer', 'MFP-0402', 'Kyocera sprat 2, Direkcija', 'IN_USE', null, 'loc_hq', 'HARDWARE'],
    ['phone', 'TEL-5011', 'Službeni telefon service deska', 'IN_USE', context.agents.desk.id, null, 'HARDWARE'],
    ['peripheral', 'PER-0701', 'Docking stanica — magacin', 'IN_STOCK', null, 'loc_store', 'HARDWARE'],
    ['tablet', 'TAB-0601', 'Tablet za teren — prijavljen gubitak', 'LOST', null, null, 'HARDWARE'],
    ['server', 'SRV-0001', 'Hypervisor direkcija hv01', 'IN_USE', null, 'loc_hq', 'INFRASTRUCTURE'],
    ['virtual-machine', 'VM-MAIL-01', 'Poštanski server', 'IN_USE', null, 'loc_hq', 'INFRASTRUCTURE'],
    ['network-device', 'SW-VIS-01', 'Pristupni switch Visoko', 'IN_USE', null, null, 'NETWORK'],
    ['application', 'APP-ERP', 'Poslovni informacioni sistem', 'IN_USE', null, null, 'SOFTWARE'],
    ['other', 'OST-001', 'UPS server sala — naručen', 'ORDERED', null, 'loc_hq', 'OTHER'],
  ];
  for (const [typeKey, tag, name, status, userId, location, category] of rows) {
    const type = context.assetType(typeKey);
    if (type.category !== category) {
      throw new Error(`${typeKey} nije kategorija ${category}`);
    }
    await insert(client, 'Asset', {
      id: seedId(`asset_${tag}`),
      assetTag: tag,
      typeId: type.id,
      name,
      status,
      organizationalUnitId: userId
        ? context.requesters.find((item) => item.id === userId)?.organizationalUnitId ?? unit
        : unit,
      assignedUserId: userId,
      assignedAt: userId ? new Date() : null,
      locationId: location ? seedId(location) : null,
      attributes: {},
      source: 'MANUAL',
      retiredAt: status === 'RETIRED' ? new Date() : null,
    });
  }
  const relations = [
    ['VM-MAIL-01', 'SRV-0001', 'RUNS_ON'],
    ['APP-ERP', 'VM-MAIL-01', 'DEPENDS_ON'],
    ['MON-3301', 'LAP-1001', 'CONNECTED_TO'],
    ['SW-VIS-01', 'SRV-0001', 'CONNECTED_TO'],
  ];
  for (const [from, to, kind] of relations) {
    await insert(client, 'AssetRelation', {
      id: seedId(`rel_${from}_${to}`),
      fromAssetId: seedId(`asset_${from}`),
      toAssetId: seedId(`asset_${to}`),
      kind,
    });
  }
  const inDays = (days) => new Date(Date.now() + days * 86_400_000);
  await insert(client, 'SoftwareLicense', {
    id: seedId('lic_m365'),
    productName: 'Microsoft 365 E3',
    vendor: 'Microsoft',
    kind: 'PER_USER',
    seats: 40,
    validUntil: inDays(240),
    organizationalUnitId: unit,
    notes: 'Godišnja pretplata direkcije.',
  });
  await insert(client, 'LicenseAssignment', {
    id: seedId('lic_m365_amar'),
    licenseId: seedId('lic_m365'),
    userId: amar.id,
  });
  await insert(client, 'SoftwareLicense', {
    id: seedId('lic_office'),
    productName: 'Office na LAP-1001',
    vendor: 'Microsoft',
    kind: 'PER_DEVICE',
    seats: 1,
    validUntil: inDays(180),
    organizationalUnitId: unit,
  });
  await insert(client, 'LicenseAssignment', {
    id: seedId('lic_office_lap'),
    licenseId: seedId('lic_office'),
    assetId: seedId('asset_LAP-1001'),
  });
  await insert(client, 'SoftwareLicense', {
    id: seedId('lic_av'),
    productName: 'Antivirus direkcija',
    vendor: 'ESET',
    kind: 'SITE',
    validUntil: inDays(300),
    organizationalUnitId: unit,
  });
  await insert(client, 'AssetContract', {
    id: seedId('con_warranty'),
    kind: 'WARRANTY',
    supplier: 'Comtrade',
    reference: 'GAR-LAP-2026',
    endsAt: inDays(400),
    organizationalUnitId: unit,
    notes: 'Garancija na LAP-1001 i LAP-1002.',
  });
  await insert(client, 'AssetContractItem', {
    contractId: seedId('con_warranty'),
    assetId: seedId('asset_LAP-1001'),
  });
  await insert(client, 'AssetContract', {
    id: seedId('con_support'),
    kind: 'SUPPORT',
    supplier: 'Mrežni integrator',
    reference: 'POD-SW-VIS',
    endsAt: inDays(120),
    organizationalUnitId: unit,
    notes: 'Podrška za pristupni switch u Visokom.',
  });
  await insert(client, 'AssetContractItem', {
    contractId: seedId('con_support'),
    assetId: seedId('asset_SW-VIS-01'),
  });
  await insert(client, 'AssetTransfer', {
    id: seedId('xfer_lap'),
    number: 'PR-2026-0007',
    year: 2026,
    month: 10,
    sequence: 7,
    scenario: 'WAREHOUSE_TO_USER',
    status: 'SIGNED',
    fromLabel: 'IT magacin',
    toUserId: amar.id,
    issuedByUserId: context.agents.equipment.id,
    snapshot: { assetTag: 'LAP-1001', to: amar.email },
    signedAt: new Date(),
  });
  await insert(client, 'AssetTransferItem', {
    id: seedId('xfer_lap_item'),
    transferId: seedId('xfer_lap'),
    assetId: seedId('asset_LAP-1001'),
    position: 1,
  });
}
