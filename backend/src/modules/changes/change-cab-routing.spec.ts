import { ancestorOuPaths, decideCabGroup } from './change-cab-routing';
import { changeErrorCodes } from './changes.constants';

describe('CAB routing (BA-changes-16)', () => {
  it('names the ancestor chain nearest first', () => {
    expect(ancestorOuPaths('/Skupina/Regija/Site')).toEqual([
      '/Skupina/Regija/Site',
      '/Skupina/Regija',
      '/Skupina',
    ]);
    expect(ancestorOuPaths('/Skupina')).toEqual(['/Skupina']);
  });

  it('keeps an explicit choice, even one outside the unit chain', () => {
    expect(
      decideCabGroup({
        requestedCabGroupId: 'cab-central',
        cabGroupIdsByLevel: [['cab-unit']],
        otherCabGroupIds: ['cab-x', 'cab-y'],
      }),
    ).toEqual({ cabGroupId: 'cab-central', cabRouting: 'explicit' });
  });

  it('routes to the only CAB group of the change unit', () => {
    expect(
      decideCabGroup({
        requestedCabGroupId: null,
        cabGroupIdsByLevel: [['cab-unit'], ['cab-central']],
        otherCabGroupIds: [],
      }),
    ).toEqual({ cabGroupId: 'cab-unit', cabRouting: 'single-covering' });
  });

  it('routes to the nearest ancestor that has exactly one CAB group', () => {
    // The unit itself has none, the branch above it has one, the root has one
    // too: the nearest one wins, and the choice is not alphabetical.
    expect(
      decideCabGroup({
        requestedCabGroupId: null,
        cabGroupIdsByLevel: [[], ['cab-branch'], ['cab-root']],
        otherCabGroupIds: [],
      }),
    ).toEqual({ cabGroupId: 'cab-branch', cabRouting: 'single-covering' });
  });

  it('refuses to choose when the nearest level has several CAB groups', () => {
    expect(() =>
      decideCabGroup({
        requestedCabGroupId: null,
        cabGroupIdsByLevel: [['cab-a', 'cab-b'], ['cab-root']],
        otherCabGroupIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: changeErrorCodes.cabGroupRequired }));
  });

  it('falls back to the only CAB group of the installation', () => {
    expect(
      decideCabGroup({
        requestedCabGroupId: null,
        cabGroupIdsByLevel: [[], []],
        otherCabGroupIds: ['cab-only'],
      }),
    ).toEqual({ cabGroupId: 'cab-only', cabRouting: 'single-installation' });
  });

  it('refuses to choose when the unit chain has none and the installation has several', () => {
    expect(() =>
      decideCabGroup({
        requestedCabGroupId: null,
        cabGroupIdsByLevel: [[]],
        otherCabGroupIds: ['cab-a', 'cab-b'],
      }),
    ).toThrow(expect.objectContaining({ code: changeErrorCodes.cabGroupRequired, detail: 'cabGroupId' }));
  });

  it('refuses to choose when the installation has no CAB group at all', () => {
    expect(() =>
      decideCabGroup({ requestedCabGroupId: null, cabGroupIdsByLevel: [[]], otherCabGroupIds: [] }),
    ).toThrow(expect.objectContaining({ code: changeErrorCodes.cabGroupRequired }));
  });
});
