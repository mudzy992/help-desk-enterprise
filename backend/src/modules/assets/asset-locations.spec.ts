import { buildLocationPaths, checkLocationParent, locationDepth, locationSubtreeIds, type LocationNode } from './asset-locations';

const nodes: LocationNode[] = [
  { id: 'hq', name: 'Direkcija', parentId: null },
  { id: 'ze', name: 'ED Zenica', parentId: 'hq' },
  { id: 'vi', name: 'Visoko', parentId: 'ze' },
  { id: 'ka', name: 'Kakanj', parentId: 'ze' },
];

describe('asset location tree (§7)', () => {
  it('builds full paths and subtrees', () => {
    expect(buildLocationPaths(nodes).get('vi')).toBe('Direkcija › ED Zenica › Visoko');
    expect(locationSubtreeIds(nodes, 'ze').sort()).toEqual(['ka', 'vi', 'ze']);
    expect(locationDepth(nodes, 'vi')).toBe(3);
  });

  it('allows a third level and blocks cycles and too deep trees', () => {
    expect(checkLocationParent(nodes, null, 'ze', 6)).toBeNull();
    expect(checkLocationParent(nodes, 'ze', 'vi', 6)).toBe('cycle');
    expect(checkLocationParent(nodes, 'ze', 'ze', 6)).toBe('self');
    expect(checkLocationParent(nodes, null, 'vi', 3)).toBe('depth');
    expect(checkLocationParent(nodes, 'ze', 'hq', 3)).toBeNull();
  });
});
