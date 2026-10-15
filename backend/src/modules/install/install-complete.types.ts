import type { SettingValue } from '../settings/settings.types';

export type InstallCompletionPersistResult = {
  readonly completedAt: string;
  readonly alreadyCompleted: boolean;
};

export type InstallSettingsWriteTransaction = {
  readonly appSetting: {
    findUnique: (args: {
      where: { key: string };
      select: { value: true };
    }) => Promise<{ value: unknown } | null>;
    upsert: (args: {
      where: { key: string };
      create: {
        key: string;
        value: SettingValue;
        scope: 'PUBLIC' | 'PRIVATE';
        isSecret: boolean;
        description: string;
      };
      update: {
        value: SettingValue;
        scope: 'PUBLIC' | 'PRIVATE';
        isSecret: boolean;
        description: string;
      };
    }) => Promise<unknown>;
  };
  readonly changeLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

/**
 * The minimum a caller needs to write install settings in one transaction.
 *
 * The `__narrowPrismaShape` marker is on purpose: this type exists so tests can
 * pass an in-memory double, and a real client (or the sandbox's Prisma stub) is
 * **not** assignable to it — its overloaded `$transaction` does not match the
 * single callback signature. Without the marker the sandbox accepted
 * `persistInstallMarker(this.prisma, …)` while `nest build` in CI rejected it
 * (after F4), so the marker turns that CI-only failure into a local one: every
 * caller has to say out loud what it is doing (`as unknown as
 * InstallCompletionPrisma`, as `install-complete.service.ts` does) or take
 * `PrismaService` instead.
 */
export type InstallCompletionPrisma = {
  /** Never set at runtime; see the note above. */
  readonly __narrowPrismaShape: 'install-settings-write';
  readonly $transaction: <T>(
    callback: (transaction: InstallSettingsWriteTransaction) => Promise<T>,
  ) => Promise<T>;
};
