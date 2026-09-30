import {
  resolveSignatory,
  sampleTransferSnapshot,
  scrubSnapshotParty,
  signatoryUnitOwner,
  transferDocumentData,
  validateMove,
  warehouseParty,
  type SignatoryEntry,
  type SignatoryUnit,
} from './plan-asset-transfer';

const units = new Map<string, SignatoryUnit>([
  ['root', { id: 'root', parentId: null }],
  ['it', { id: 'it', parentId: 'root' }],
  ['it-support', { id: 'it-support', parentId: 'it' }],
  ['finance', { id: 'finance', parentId: 'root' }],
]);

describe('resolveSignatory (3.2 §7a.2)', () => {
  const signatories = new Map<string, SignatoryEntry>([
    ['root', { userId: 'director', title: 'Direktor', isActive: true }],
    ['it', { userId: 'it-head', title: 'Šef IT', isActive: true }],
  ]);

  it('uses the unit itself first', () => {
    expect(resolveSignatory({ unitId: 'it', units, signatories, defaultUserId: null })).toMatchObject({ userId: 'it-head', inheritedFromUnitId: null });
  });

  it('inherits from the nearest ancestor', () => {
    expect(resolveSignatory({ unitId: 'it-support', units, signatories, defaultUserId: null })).toMatchObject({ userId: 'it-head', inheritedFromUnitId: 'it' });
    expect(resolveSignatory({ unitId: 'finance', units, signatories, defaultUserId: null })).toMatchObject({ userId: 'director', inheritedFromUnitId: 'root' });
  });

  it('skips a deactivated signatory', () => {
    const withInactive = new Map(signatories).set('it', { userId: 'it-head', title: null, isActive: false });
    expect(resolveSignatory({ unitId: 'it-support', units, signatories: withInactive, defaultUserId: null })).toMatchObject({ userId: 'director' });
  });

  it('falls back to the default, then none', () => {
    expect(resolveSignatory({ unitId: null, units, signatories, defaultUserId: 'fallback' })).toEqual({ userId: 'fallback', title: null, source: 'default' });
    expect(resolveSignatory({ unitId: 'finance', units, signatories: new Map(), defaultUserId: null })).toEqual({ userId: null, source: 'none' });
  });

  it('survives a cycle in a broken tree', () => {
    const cyclic = new Map<string, SignatoryUnit>([
      ['a', { id: 'a', parentId: 'b' }],
      ['b', { id: 'b', parentId: 'a' }],
    ]);
    expect(resolveSignatory({ unitId: 'a', units: cyclic, signatories: new Map(), defaultUserId: null }).source).toBe('none');
  });

  it('a return is signed for the unit of the person handing over', () => {
    expect(signatoryUnitOwner('USER_TO_WAREHOUSE')).toBe('from');
    expect(signatoryUnitOwner('WAREHOUSE_TO_USER')).toBe('to');
    expect(signatoryUnitOwner('USER_TO_USER')).toBe('to');
  });
});

describe('validateMove', () => {
  const stock = { id: 'a', assetTag: 'INV-1', status: 'IN_STOCK', assignedUserId: null };
  const held = (user: string, tag = 'INV-2') => ({ id: tag, assetTag: tag, status: 'IN_USE', assignedUserId: user });

  it('warehouse → user needs unassigned stock and a receiver', () => {
    expect(validateMove({ scenario: 'WAREHOUSE_TO_USER', assets: [stock], toUserId: 'u1', returnStatus: null }).problems).toEqual([]);
    expect(validateMove({ scenario: 'WAREHOUSE_TO_USER', assets: [held('u2')], toUserId: 'u1', returnStatus: null }).problems).toEqual([
      { code: 'already_assigned', assetTag: 'INV-2' },
    ]);
    expect(
      validateMove({ scenario: 'WAREHOUSE_TO_USER', assets: [{ ...stock, status: 'LOST' }], toUserId: null, returnStatus: null }).problems.map((p) => p.code),
    ).toEqual(['not_in_stock', 'receiver_required']);
  });

  it('user → user needs one holder and a different receiver', () => {
    expect(validateMove({ scenario: 'USER_TO_USER', assets: [held('u1'), held('u1', 'INV-3')], toUserId: 'u2', returnStatus: null })).toEqual({
      problems: [],
      fromUserId: 'u1',
    });
    expect(validateMove({ scenario: 'USER_TO_USER', assets: [held('u1'), held('u2', 'INV-3')], toUserId: 'u3', returnStatus: null }).problems).toEqual([
      { code: 'different_holders' },
    ]);
    expect(validateMove({ scenario: 'USER_TO_USER', assets: [held('u1')], toUserId: 'u1', returnStatus: null }).problems).toEqual([{ code: 'same_user' }]);
  });

  it('user → warehouse needs assigned items', () => {
    expect(validateMove({ scenario: 'USER_TO_WAREHOUSE', assets: [stock], toUserId: null, returnStatus: 'IN_STOCK' }).problems).toEqual([
      { code: 'not_assigned', assetTag: 'INV-1' },
    ]);
    expect(validateMove({ scenario: 'USER_TO_WAREHOUSE', assets: [held('u1')], toUserId: null, returnStatus: 'RETIRED' }).problems).toEqual([
      { code: 'return_status' },
    ]);
  });
});

describe('snapshot helpers', () => {
  it('empty free text on first issue prints the warehouse', () => {
    expect(warehouseParty('  ', '', 'bs').name).toBe('Skladište');
    expect(warehouseParty('', 'Centralno skladište', 'bs').name).toBe('Centralno skladište');
    expect(warehouseParty('Dobavljač d.o.o.', 'Centralno skladište', 'en').name).toBe('Dobavljač d.o.o.');
  });

  it('maps a snapshot to the document placeholders', () => {
    const data = transferDocumentData({ ...sampleTransferSnapshot('bs', 'Europe/Sarajevo'), issuedAt: '2026-09-30T22:30:00Z' });
    expect(data).toMatchObject({ broj: '09-0007-2026', predaje_ime: 'Skladište', preuzima_ime: 'Amra Hodžić', jeZaduzenje: true, broj_stavki: '2' });
    expect(data.datum).toContain('2026');
    expect(data.datum).toContain('01');
    expect(data.stavke[1]).toMatchObject({ rb: '2', inventarni_broj: 'INV-2026-00002' });
  });

  it('scrubs a person everywhere in a snapshot', () => {
    const base = sampleTransferSnapshot('bs', 'UTC');
    const snapshot = { ...base, to: { ...base.to, userId: 'u1' }, issuedBy: { ...base.issuedBy, userId: 'u1' } };
    const scrubbed = scrubSnapshotParty(snapshot, 'u1', 'Anonimni korisnik #ab12');
    expect(scrubbed?.to).toEqual({ userId: 'u1', name: 'Anonimni korisnik #ab12', title: '', unit: '', email: '' });
    expect(scrubbed?.issuedBy.name).toBe('Anonimni korisnik #ab12');
    expect(scrubbed?.items).toEqual(base.items);
    expect(scrubSnapshotParty(snapshot, 'other', 'x')).toBeNull();
  });
});
