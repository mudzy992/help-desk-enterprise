export type InMemoryInstallSlaProfile = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly isActive: boolean;
};

/**
 * Install wizard v2 (F0.7): readiness §3 asks whether an active SLA profile
 * exists (`starting-sla-seed.service.ts` creates them on boot). The install seed
 * harness needed the table to answer that question.
 */
export function createInMemoryInstallSlaProfileDelegate(input: {
  readonly nextId: () => string;
  readonly now: () => Date;
}) {
  const profiles = new Map<string, InMemoryInstallSlaProfile>();
  return {
    profiles,
    prisma: {
      findMany: async (
        { where, select }: {
          where?: { isActive?: boolean };
          select?: Record<string, boolean>;
        } = {},
      ) =>
        [...profiles.values()]
          .filter(
            (profile) =>
              where?.isActive === undefined || profile.isActive === where.isActive,
          )
          .map((profile) => {
            if (select === undefined) {
              return profile;
            }
            const picked: Record<string, unknown> = {};
            for (const [key, enabled] of Object.entries(select)) {
              if (enabled) {
                picked[key] = profile[key as keyof InMemoryInstallSlaProfile];
              }
            }
            return picked;
          }),
      findUnique: async ({
        where,
        select,
      }: {
        where: { id?: string; key?: string };
        select?: Record<string, boolean>;
      }) => {
        const found =
          [...profiles.values()].find((profile) =>
            where.id === undefined ? profile.key === where.key : profile.id === where.id,
          ) ?? null;
        if (found === null || select === undefined) {
          return found;
        }
        const picked: Record<string, unknown> = {};
        for (const [key, enabled] of Object.entries(select)) {
          if (enabled) {
            picked[key] = found[key as keyof InMemoryInstallSlaProfile];
          }
        }
        return picked;
      },
      findFirst: async ({ where }: { where?: { isActive?: boolean } } = {}) =>
        [...profiles.values()].find(
          (profile) =>
            where?.isActive === undefined || profile.isActive === where.isActive,
        ) ?? null,
      count: async ({ where }: { where?: { isActive?: boolean } } = {}) =>
        [...profiles.values()].filter(
          (profile) =>
            where?.isActive === undefined || profile.isActive === where.isActive,
        ).length,
      create: async ({
        data,
      }: {
        data: { key: string; name: string; isActive?: boolean };
      }) => {
        const created: InMemoryInstallSlaProfile = {
          id: input.nextId(),
          key: data.key,
          name: data.name,
          isActive: data.isActive ?? true,
        };
        profiles.set(created.id, created);
        void input.now;
        return created;
      },
    },
    seedProfile: (profile: InMemoryInstallSlaProfile) => {
      profiles.set(profile.id, profile);
    },
  };
}
