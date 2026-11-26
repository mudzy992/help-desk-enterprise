export type InMemoryInstallUser = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  isLocalOnly: boolean;
  localPasswordHash: string | null;
  entraObjectId: string | null;
  /**
   * W2.25 (`BA-groups-02`): the membership write bumps this inside its own
   * transaction, so the install double has to carry the column the real schema has.
   * Optional only so fixtures that never touch membership stay readable.
   */
  authzVersion?: number;
};

export type InMemoryInstallRole = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
};

export type InMemoryInstallUserRole = {
  id: string;
  userId: string;
  roleId: string;
};

export type InMemoryInstallPermission = {
  id: string;
  key: string;
};

export type InMemoryInstallRolePermission = {
  id: string;
  roleId: string;
  permissionId: string;
};

export function pickInstallSelectedFields<T extends object>(
  record: T,
  select: Record<string, boolean> | undefined,
): Partial<T> | T {
  if (select === undefined) {
    return record;
  }
  const picked: Partial<T> = {};
  for (const key of Object.keys(select) as (keyof T)[]) {
    if (select[key as string]) {
      picked[key] = record[key];
    }
  }
  return picked;
}
