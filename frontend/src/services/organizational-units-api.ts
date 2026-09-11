import { apiRequest } from "@/services/api";

export type OrganizationalUnitTreeNode = {
  readonly id: string;
  readonly name: string;
  readonly ouPath: string;
  readonly type?: string;
  readonly distinguishedName?: string;
  readonly company?: string | null;
  readonly department?: string | null;
  readonly parentId?: string | null;
  readonly children: readonly OrganizationalUnitTreeNode[];
};

export type OrganizationalUnitUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationalUnitId: string | null;
};

export function listOrganizationalUnitTree(): Promise<
  readonly OrganizationalUnitTreeNode[]
> {
  return apiRequest("/organizational-units/tree");
}

export function listOrganizationalUnitUsers(
  organizationalUnitId: string,
): Promise<readonly OrganizationalUnitUser[]> {
  return apiRequest(`/organizational-units/${organizationalUnitId}/users`);
}
