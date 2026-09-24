import { invalidateConfigurationCachesAfter } from '../settings/invalidate-configuration-caches';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ChangeLogDiffPayload } from '../change-log/change-log.types';
import { requireChangeReason } from '../change-log/require-change-reason';
import { SettingsService } from '../settings/settings.service';
import { SETTINGS_REGISTRY } from '../settings/settings.registry-token';
import type { SettingsRegistry } from '../settings/settings.types';
import { collectConfigSnapshot } from './collect-config-snapshot';
import { configVersioningErrorCodes } from './config-versioning.constants';
import {
  assertConfigActivationAllowed,
  requireConfigVersioningEnabled,
  requireConfigVersionRecord,
} from './config-versioning-access';
import { ConfigVersioningConfigurationLoader } from './config-versioning-configuration.loader';
import { ConfigVersioningError } from './config-versioning.error';
import { ConfigVersioningRepository } from './config-versioning.repository';
import type {
  ConfigShadowDiff,
  ConfigValidationIssue,
  ConfigVersionDetailResponse,
  ConfigVersionResponse,
} from './config-versioning.types';
import { diffConfigSnapshots } from './diff-config-snapshots';
import {
  executeConfigRollback,
  executeConfigShadow,
} from './execute-config-rollback';
import { parseConfigSnapshot } from './parse-config-snapshot';
import { persistActivatedConfigVersion } from './persist-activated-config-version';
import {
  toConfigVersionDetailResponse,
  toConfigVersionResponse,
} from './to-config-version-response';
import { validateConfigSnapshot } from './validate-config-snapshot';

@Injectable()
export class ConfigVersioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ConfigVersioningRepository,
    private readonly settingsService: SettingsService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
    private readonly configurationLoader: ConfigVersioningConfigurationLoader,
  ) {}

  async create(
    releaseNotes: string | undefined,
    actorUserId: string | null,
  ): Promise<ConfigVersionResponse> {
    const configuration = await requireConfigVersioningEnabled(
      this.configurationLoader,
    );
    const snapshot = await collectConfigSnapshot(
      this.prisma,
      this.settingsService,
      configuration.scopes,
    );
    const record = await this.repository.create({
      version: await this.repository.nextVersionNumber(),
      snapshot,
      releaseNotes: releaseNotes?.trim() || null,
      createdByUserId: actorUserId,
    });
    return toConfigVersionResponse(record, snapshot);
  }

  async list(): Promise<readonly ConfigVersionResponse[]> {
    await requireConfigVersioningEnabled(this.configurationLoader);
    const records = await this.repository.list();
    return records.map((record) =>
      toConfigVersionResponse(record, parseConfigSnapshot(record.snapshot)),
    );
  }

  async get(id: string): Promise<ConfigVersionDetailResponse> {
    await requireConfigVersioningEnabled(this.configurationLoader);
    const record = await requireConfigVersionRecord(this.repository, id);
    return toConfigVersionDetailResponse(
      record,
      parseConfigSnapshot(record.snapshot),
    );
  }

  async diff(id: string, againstId: string): Promise<ChangeLogDiffPayload> {
    await requireConfigVersioningEnabled(this.configurationLoader);
    const left = parseConfigSnapshot(
      (await requireConfigVersionRecord(this.repository, id)).snapshot,
    );
    const rightRecord = await this.repository.findById(againstId);
    if (rightRecord === null) {
      throw new ConfigVersioningError(configVersioningErrorCodes.againstNotFound);
    }
    return diffConfigSnapshots(left, parseConfigSnapshot(rightRecord.snapshot));
  }

  async validate(id: string): Promise<{
    readonly valid: boolean;
    readonly errors: readonly ConfigValidationIssue[];
  }> {
    const configuration = await requireConfigVersioningEnabled(
      this.configurationLoader,
    );
    const record = await requireConfigVersionRecord(this.repository, id);
    const snapshot = parseConfigSnapshot(record.snapshot);
    const errors = validateConfigSnapshot(snapshot, this.registry, configuration);
    if (errors.length === 0 && record.status === 'DRAFT') {
      await this.repository.updateStatus(record.id, 'VALIDATED');
    }
    return { valid: errors.length === 0, errors };
  }

  async activate(
    id: string,
    reason: string | undefined,
    actorUserId: string | null,
  ): Promise<ConfigVersionResponse> {
    const configuration = await requireConfigVersioningEnabled(
      this.configurationLoader,
    );
    const normalizedReason = requireChangeReason(reason);
    const record = await requireConfigVersionRecord(this.repository, id);
    const snapshot = parseConfigSnapshot(record.snapshot);
    assertConfigActivationAllowed(snapshot, this.registry, configuration);
    const previousActive = await this.repository.findActive();
    await invalidateConfigurationCachesAfter(this.prisma.$transaction((transaction) =>
      persistActivatedConfigVersion(transaction, {
        candidate: record,
        snapshot,
        previousActive,
        previousStatus: 'VALIDATED',
        reason: normalizedReason,
        actorUserId,
        auditAction: 'config_version.activate',
        registry: this.registry,
      }),
    ));
    return this.get(id);
  }

  async rollback(
    id: string,
    reason: string | undefined,
    actorUserId: string | null,
    targetVersionId?: string,
  ): Promise<ConfigVersionResponse> {
    const configuration = await requireConfigVersioningEnabled(
      this.configurationLoader,
    );
    return executeConfigRollback({
      prisma: this.prisma,
      repository: this.repository,
      registry: this.registry,
      configuration,
      id,
      reason,
      actorUserId,
      targetVersionId,
    });
  }

  async shadow(id: string): Promise<ConfigShadowDiff> {
    const configuration = await requireConfigVersioningEnabled(
      this.configurationLoader,
    );
    return executeConfigShadow({
      prisma: this.prisma,
      repository: this.repository,
      settingsService: this.settingsService,
      configuration,
      id,
    });
  }
}
