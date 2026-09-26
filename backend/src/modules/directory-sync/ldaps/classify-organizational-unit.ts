/**
 * Paket 1.8: organizational unit type from its position (RAW §17–20):
 * the users root is a DIRECTORATE; below it `Direkcija` is a DIRECTORATE with
 * SERVICE children, every other top-level unit (`ED <grad>`) is a BRANCH with
 * OFFICE children; anything deeper is a SECTOR.
 */
export type ClassifiedOrganizationalUnitType =
  | 'DIRECTORATE'
  | 'BRANCH'
  | 'OFFICE'
  | 'SECTOR'
  | 'SERVICE';

export function classifyOrganizationalUnit(input: {
  readonly path: string;
  readonly rootPath: string;
  readonly directorateNames?: readonly string[];
}): ClassifiedOrganizationalUnitType {
  const directorates = (input.directorateNames ?? ['Direkcija']).map((name) =>
    name.toLowerCase(),
  );
  const root = input.rootPath.split('/').filter(Boolean);
  const segments = input.path.split('/').filter(Boolean);
  const depth = segments.length - root.length;
  if (depth <= 0) {
    return 'DIRECTORATE';
  }
  const topLevel = (segments[root.length] ?? '').toLowerCase();
  const isDirectorate = directorates.includes(topLevel);
  if (depth === 1) {
    return isDirectorate ? 'DIRECTORATE' : 'BRANCH';
  }
  if (depth === 2) {
    return isDirectorate ? 'SERVICE' : 'OFFICE';
  }
  return 'SECTOR';
}
