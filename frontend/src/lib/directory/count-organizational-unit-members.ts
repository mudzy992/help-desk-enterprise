import type { DirectoryUser } from "@/lib/directory/use-directory";

export function countOrganizationalUnitMembers(
  users: readonly DirectoryUser[],
  organizationalUnitId: string,
): number {
  return users.filter((user) => user.organizationalUnitId === organizationalUnitId)
    .length;
}
