import { apiRequest } from "@/services/api";

export type OrganizationalUnitTreeNode = {
  readonly id: string;
  readonly name: string;
  readonly ouPath: string;
  readonly children: readonly OrganizationalUnitTreeNode[];
};

export function listOrganizationalUnitTree(): Promise<
  readonly OrganizationalUnitTreeNode[]
> {
  return apiRequest("/organizational-units/tree");
}
