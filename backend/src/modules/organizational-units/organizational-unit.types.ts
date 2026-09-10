import type { OrganizationalUnitType } from '../../generated/prisma/enums';

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
