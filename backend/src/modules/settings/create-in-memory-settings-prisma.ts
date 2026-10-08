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
      findMany: async ({ select }: { select?: { key?: true; value?: true } } = {}) =>
        [...settings.values()].map((row) => {
          if (select === undefined) {
            return row;
          }
          // Paket 5.3.3: the dependency resolver only asks for key/value.
          return {
            ...(select.key === true ? { key: row.key } : {}),
            ...(select.value === true ? { value: row.value } : {}),
          };
        }),
      deleteMany: async ({ where }: { where: { key: string } }) => {
        const deleted = settings.delete(where.key);
        return { count: deleted ? 1 : 0 };
      },
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
    /**
     * Paket 5.3.3: the dependency gate throws *inside* the transaction once a
     * write would strand a dependent, so the double has to roll back like
     * Prisma does — otherwise a spec would \"see\" rows the real database never
     * kept.
     */
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => {
      const settingsBefore = new Map(settings);
      const changeLogCountBefore = changeLogs.length;
      try {
        return await callback(prisma);
      } catch (error) {
        settings.clear();
        for (const [key, row] of settingsBefore) {
          settings.set(key, row);
        }
        changeLogs.length = changeLogCountBefore;
        throw error;
      }
    },
  };
  return { prisma, changeLogs, getStored: (key: string) => settings.get(key) };
}
