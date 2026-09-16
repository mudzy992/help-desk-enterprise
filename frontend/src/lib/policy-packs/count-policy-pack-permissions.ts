export function countPolicyPackPermissions(
  grants: readonly { readonly permissionKeys: readonly string[] }[],
): number {
  const unique = new Set<string>();
  for (const grant of grants) {
    for (const key of grant.permissionKeys) {
      unique.add(key);
    }
  }
  return unique.size;
}
