export function createInMemorySettingsPrisma() {
  const settings = new Map<
    string,
    {
      key: string;
      value: unknown;
      scope: string;
      isSecret: boolean;
      description: string;
    }
  >();
  const changeLogs: Array<{
    entityType: string;
    entityId: string;
    reason: string;
    diff: {
      action: string;
      resourceType: string;
      resourceId: string;
      before: unknown;
      after: unknown;
      changes: readonly { path: string; before: unknown; after: unknown }[];
    };
    actorUserId: string | null;
  }> = [];
  const prisma = {
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        settings.get(where.key) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: {
          key: string;
          value: unknown;
          scope: string;
          isSecret: boolean;
          description: string;
        };
        update: {
          value: unknown;
          scope: string;
          isSecret: boolean;
          description: string;
        };
      }) => {
        const current = settings.get(where.key);
        const next = current === undefined ? create : { ...current, ...update };
        settings.set(where.key, next);
        return next;
      },
    },
    changeLog: {
      create: async ({ data }: { data: (typeof changeLogs)[number] }) => {
        changeLogs.push(data);
        return data;
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };
  return { prisma, changeLogs, getStored: (key: string) => settings.get(key) };
}
