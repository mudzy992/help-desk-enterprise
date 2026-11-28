import type { OrganizationalUnitType } from '../../generated/prisma/enums';
export type { OrganizationalUnitAuditContext, OrganizationalUnitDeleteBlocker, OrganizationalUnitDeleteResponse, OrganizationalUnitDeleteWarning } from './organizational-unit-delete.types';

export type OrganizationalUnitRecord = {
  readonly id: string;
  readonly name: string;
  readonly type: OrganizationalUnitType;
  readonly distinguishedName: string;
  readonly ouPath: string;
  readonly company: string | null;
  readonly department: string | null;
  readonly parentId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type OrganizationalUnitResponse = {
  readonly id: string;
  readonly name: string;
  readonly type: OrganizationalUnitType;
  readonly distinguishedName: string;
  readonly ouPath: string;
  readonly company: string | null;
  readonly department: string | null;
  readonly parentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type OrganizationalUnitUserResponse = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationalUnitId: string | null;
};

export type OrganizationalUnitDetailResponse = OrganizationalUnitResponse & {
  readonly children: readonly OrganizationalUnitResponse[];
  readonly users: readonly OrganizationalUnitUserResponse[];
};

export type OrganizationalUnitTreeNodeResponse = OrganizationalUnitResponse & {
  readonly children: readonly OrganizationalUnitTreeNodeResponse[];
};

/**
 * W2.36 (`BA-organizational-units-06`): the shape a caller **without**
 * `organizationalUnit.manage` receives from `GET /organizational-units/tree`.
 * It carries what a selector needs (identity, label, icon type and the parent
 * structure) and nothing that describes the directory topology: no
 * `distinguishedName`, no `ouPath`, no company/department, no timestamps.
 */
export type OrganizationalUnitTreeSummaryNode = {
  readonly id: string;
  readonly name: string;
  readonly type: OrganizationalUnitType;
  readonly children: readonly OrganizationalUnitTreeSummaryNode[];
};

/** The tree route answers with either shape; which one is decided server-side. */
export type OrganizationalUnitTreeResponseNode =
  | OrganizationalUnitTreeNodeResponse
  | OrganizationalUnitTreeSummaryNode;

export type CreateOrganizationalUnitInput = {
  readonly name: string;
  readonly type: OrganizationalUnitType;
  readonly distinguishedName: string;
  readonly parentId?: string | null;
  readonly company?: string | null;
  readonly department?: string | null;
};

export type UpdateOrganizationalUnitInput = {
  readonly name?: string;
  readonly type?: OrganizationalUnitType;
  readonly distinguishedName?: string;
  readonly parentId?: string | null;
  readonly company?: string | null;
  readonly department?: string | null;
};

export type AssignUserOrganizationalUnitInput = {
  readonly userId: string;
  readonly organizationalUnitId: string | null;
};
