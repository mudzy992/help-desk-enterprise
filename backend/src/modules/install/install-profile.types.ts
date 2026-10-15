import type { SettingValue } from '../settings/settings.types';
import type { InstallProfilePackage } from './install-profile.catalog';
import type { InstallProfile, InstallStepKey } from './steps/install-step.types';

export type InstallProfileStatus = {
  readonly profile: InstallProfile | null;
  readonly packages: readonly InstallProfilePackage[];
  /**
   * IN19: steps whose "Podesi kasnije" flag the save just dropped because the new
   * package requires them. Empty on reads — it answers a package change, so the
   * wizard can explain why those steps are back in the flow.
   */
  readonly reopenedSteps: readonly InstallStepKey[];
};

export type SaveInstallProfileInput = {
  readonly profile: InstallProfile;
};

/**
 * The transaction shape the package change needs: write the choice, drop the
 * state the new package does not contain, and log both as one logical change.
 */
export type InstallProfileWriteTransaction = {
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
    deleteMany: (args: {
      where: { key: { in: readonly string[] } };
    }) => Promise<{ count: number }>;
  };
  readonly changeLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type InstallProfilePrisma = {
  readonly $transaction: <T>(
    callback: (transaction: InstallProfileWriteTransaction) => Promise<T>,
  ) => Promise<T>;
};

export type ResetInstallStepSkipPrisma = {
  readonly changeLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};
