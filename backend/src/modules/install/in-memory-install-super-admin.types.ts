export type InMemoryInstallUser = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  isLocalOnly: boolean;
  localPasswordHash: string | null;
  entraObjectId: string | null;
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
