export function isForestRootDistinguishedName(
  distinguishedName: string,
): boolean {
  if (distinguishedName.length === 0) {
    return true;
  }
  return distinguishedName.split(',').every((part) => part.startsWith('DC='));
}
