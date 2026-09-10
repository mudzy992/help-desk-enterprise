export function rewriteOrganizationalUnitPath(input: {
  readonly currentPath: string;
  readonly oldAncestorPath: string;
  readonly newAncestorPath: string;
}): string {
  if (input.currentPath === input.oldAncestorPath) {
    return input.newAncestorPath;
  }
  const prefix = `${input.oldAncestorPath}/`;
  if (!input.currentPath.startsWith(prefix)) {
    return input.currentPath;
  }
  return `${input.newAncestorPath}${input.currentPath.slice(input.oldAncestorPath.length)}`;
}
