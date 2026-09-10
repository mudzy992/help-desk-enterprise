export function buildOrganizationalUnitPath(input: {
  readonly name: string;
  readonly parentPath: string | null;
}): string {
  if (input.parentPath === null) {
    return `/${input.name}`;
  }
  return `${input.parentPath}/${input.name}`;
}
