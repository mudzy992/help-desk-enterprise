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

export type InstallCompletionPrisma = {
  readonly $transaction: <T>(
    callback: (transaction: InstallSettingsWriteTransaction) => Promise<T>,
  ) => Promise<T>;
};
