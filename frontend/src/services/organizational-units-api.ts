import { apiRequest } from "@/services/api";

/**
 * W2.36 (`BA-organizational-units-06`): `GET /organizational-units/tree` answers
 * with two shapes. A caller that may manage units gets the admin projection
 * (path, DN, org metadata); everyone else — USER, AGENT, service accounts — gets
 * only `id`, `name`, `type` and `children`. The privileged fields are therefore
 * optional here, and every consumer has to fall back to the label.
 */
export type OrganizationalUnitTreeNode = {
  readonly id: string;
  readonly name: string;
  readonly ouPath?: string;
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

export function listOrganizationalUnitTree(): Promise<readonly OrganizationalUnitTreeNode[]> {
  return apiRequest("/organizational-units/tree");
}

export type OrganizationalUnitDeleteWarning = {
  readonly code: string;
  readonly count: number;
};

export type OrganizationalUnitDeleteResponse = {
  readonly warnings: readonly OrganizationalUnitDeleteWarning[];
};

/**
 * W2.37b: the tree is the authority, so deleting a unit is an organizational-unit
 * request again. The screen used to go through the manual-only catalogue and
 * refused with "not in the catalogue" whenever the mirror row was missing — even
 * for a unit the operator had just created. The server removes the mirrored
 * catalogue row in the same transaction.
 */
export function deleteOrganizationalUnit(
  organizationalUnitId: string,
): Promise<OrganizationalUnitDeleteResponse> {
  return apiRequest(`/organizational-units/${encodeURIComponent(organizationalUnitId)}`, {
    method: "DELETE",
  });
}

export function listOrganizationalUnitUsers(
  organizationalUnitId: string,
): Promise<readonly OrganizationalUnitUser[]> {
  return apiRequest(`/organizational-units/${organizationalUnitId}/users`);
}
