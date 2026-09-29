import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { JsonValue } from '../../change-log/change-log.types';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsService } from '../../settings/settings.service';
import { SETTINGS_REGISTRY } from '../../settings/settings.registry-token';
import type { SettingsRegistry } from '../../settings/settings.types';
import { collectConfigSnapshot } from '../collect-config-snapshot';
import { requireConfigVersioningEnabled, requireConfigVersionRecord } from '../config-versioning-access';
import { ConfigVersioningConfigurationLoader } from '../config-versioning-configuration.loader';
import { configVersioningErrorCodes } from '../config-versioning.constants';
import { ConfigVersioningError } from '../config-versioning.error';
import { ConfigVersioningRepository } from '../config-versioning.repository';
import type { ConfigVersionResponse } from '../config-versioning.types';
import { parseConfigSnapshot } from '../parse-config-snapshot';
import { recordConfigVersionAudit } from '../record-config-version-audit';
import { toConfigVersionResponse } from '../to-config-version-response';
import { buildPortableConfig, PortableConfigBuildError } from './build-portable-config';
import {
  configPackageFormat,
  configPackageFormatVersion,
  mappableReferenceKinds,
  type ConfigPackageReferenceKind,
} from './config-package.constants';
import {
  computeConfigPackageChecksum,
  readConfigPackageSigningKey,
  signConfigPackageChecksum,
  verifyConfigPackageSignature,
} from './config-package-integrity';
import type {
  ConfigPackage,
  ConfigPackageHeader,
  ConfigPackageImportReport,
  ConfigPackageMappings,
  ConfigReferenceIndex,
} from './config-package.types';
import { loadConfigReferenceIndex } from './load-config-reference-index';
import { ConfigPackageFormatError, parseConfigPackage } from './parse-config-package';
import { resolvePortableConfig, type PortableConfigResolution } from './resolve-portable-config';

export type ConfigPackageImportOptions = {
  readonly mappings: ConfigPackageMappings;
  readonly applyEnvironmentBound: boolean;
  readonly confirmUnsigned: boolean;
};

/**
 * Paket 2.9 (K4): export a config version as an environment-neutral package
 * and import one as a new DRAFT version. Import never activates anything; the
 * existing validate → diff → shadow → activate → rollback flow takes over.
 */
@Injectable()
export class ConfigPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ConfigVersioningRepository,
    private readonly settingsService: SettingsService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
    private readonly configurationLoader: ConfigVersioningConfigurationLoader,
  ) {}

  async exportPackage(
    id: string,
    options: { readonly includeEnvironmentBound: boolean },
    actorUserId: string | null,
  ): Promise<{ readonly fileName: string; readonly body: ConfigPackage }> {
    await requireConfigVersioningEnabled(this.configurationLoader);
    const record = await requireConfigVersionRecord(this.repository, id);
    const snapshot = parseConfigSnapshot(record.snapshot);
    const index = await loadConfigReferenceIndex(this.prisma);
    let content;
    try {
      content = buildPortableConfig(snapshot, index, {
        includeEnvironmentBound: options.includeEnvironmentBound,
        isSecret: (key) => this.isSecret(key),
      });
    } catch (error) {
      if (error instanceof PortableConfigBuildError) {
        throw new ConfigVersioningError(
          configVersioningErrorCodes.packageSourceInconsistent,
          error.missing.map((reference) => ({ code: 'missing_key', path: reference, message: reference })),
        );
      }
      throw error;
    }
    const environment = await this.environmentName();
    const header: ConfigPackageHeader = {
      format: configPackageFormat,
      formatVersion: configPackageFormatVersion,
      appVersion: readAppVersion(),
      sourceEnvironment: environment,
      sourceVersion: record.version,
      exportedAt: new Date().toISOString(),
      includesEnvironmentBound: options.includeEnvironmentBound,
    };
    const checksum = computeConfigPackageChecksum(header, content);
    const key = readConfigPackageSigningKey();
    const body: ConfigPackage = {
      ...header,
      content,
      checksum,
      signature: key === null ? null : signConfigPackageChecksum(checksum, key),
    };
    await recordConfigVersionAudit(this.prisma, {
      action: 'config_version.export',
      entityId: record.id,
      actorUserId,
      metadata: {
        version: record.version,
        checksum,
        signed: body.signature !== null,
        includesEnvironmentBound: options.includeEnvironmentBound,
      },
    });
    const date = header.exportedAt.slice(0, 10);
    const slug = (environment || 'env').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'env';
    return { fileName: `helpdesk-config-v${record.version}-${slug}-${date}.json`, body };
  }

  async previewImport(raw: unknown, options: ConfigPackageImportOptions): Promise<ConfigPackageImportReport> {
    await requireConfigVersioningEnabled(this.configurationLoader);
    const { report } = await this.resolve(raw, options);
    return report;
  }

  async importPackage(
    raw: unknown,
    options: ConfigPackageImportOptions & { readonly releaseNotes: string | undefined },
    actorUserId: string | null,
  ): Promise<ConfigVersionResponse & { readonly report: ConfigPackageImportReport }> {
    await requireConfigVersioningEnabled(this.configurationLoader);
    const { pkg, report, resolution } = await this.resolve(raw, options);
    if (report.signature === 'invalid') {
      throw new ConfigVersioningError(configVersioningErrorCodes.packageSignatureInvalid);
    }
    if (report.signature !== 'valid' && !options.confirmUnsigned) {
      throw new ConfigVersioningError(configVersioningErrorCodes.packageUnsignedNotConfirmed);
    }
    if (resolution.snapshot === null) {
      throw new ConfigVersioningError(
        configVersioningErrorCodes.packageBlocked,
        report.items
          .filter((item) => item.blocking)
          .map((item) => ({ code: item.status, path: `${item.kind}:${item.key}`, message: item.usedBy.join(', ') })),
      );
    }
    const snapshot = resolution.snapshot;
    const importMeta: JsonValue = {
      sourceEnvironment: pkg.sourceEnvironment,
      sourceVersion: pkg.sourceVersion,
      exportedAt: pkg.exportedAt,
      appVersion: pkg.appVersion,
      checksum: pkg.checksum,
      signature: report.signature,
      mappings: options.mappings as JsonValue,
      applyEnvironmentBound: options.applyEnvironmentBound,
      created: report.created as unknown as JsonValue,
      skipped: report.skipped as unknown as JsonValue,
    };
    const notes =
      options.releaseNotes?.trim() ||
      `Import: ${pkg.sourceEnvironment || '?'} v${pkg.sourceVersion} (${pkg.exportedAt.slice(0, 10)})`;
    const record = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.configVersion.create({
        data: {
          version: await this.repository.nextVersionNumber(),
          status: 'DRAFT',
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          releaseNotes: notes,
          createdByUserId: actorUserId,
          importMeta: importMeta as Prisma.InputJsonValue,
        },
      });
      await recordConfigVersionAudit(transaction, {
        action: 'config_version.import',
        entityId: created.id,
        actorUserId,
        metadata: importMeta,
      });
      return created;
    });
    return { ...toConfigVersionResponse(record, snapshot), report };
  }

  private async resolve(
    raw: unknown,
    options: ConfigPackageImportOptions,
  ): Promise<{ pkg: ConfigPackage; report: ConfigPackageImportReport; resolution: PortableConfigResolution }> {
    let pkg: ConfigPackage;
    try {
      pkg = parseConfigPackage(raw);
    } catch (error) {
      if (error instanceof ConfigPackageFormatError) {
        throw new ConfigVersioningError(configVersioningErrorCodes.packageInvalid, [
          { code: 'format', path: error.path, message: error.message },
        ]);
      }
      throw error;
    }
    const { content, checksum, signature, ...headerFields } = pkg;
    const header: ConfigPackageHeader = {
      format: headerFields.format,
      formatVersion: headerFields.formatVersion,
      appVersion: headerFields.appVersion,
      sourceEnvironment: headerFields.sourceEnvironment,
      sourceVersion: headerFields.sourceVersion,
      exportedAt: headerFields.exportedAt,
      includesEnvironmentBound: headerFields.includesEnvironmentBound,
    };
    if (computeConfigPackageChecksum(header, content) !== checksum) {
      throw new ConfigVersioningError(configVersioningErrorCodes.packageChecksumMismatch);
    }
    const configuration = await requireConfigVersioningEnabled(this.configurationLoader);
    const [target, index] = await Promise.all([
      collectConfigSnapshot(this.prisma, this.settingsService, configuration.scopes),
      loadConfigReferenceIndex(this.prisma),
    ]);
    const resolution = resolvePortableConfig({
      content,
      target,
      index,
      mappings: options.mappings,
      applyEnvironmentBound: options.applyEnvironmentBound && header.includesEnvironmentBound,
      isKnownSetting: (key) => this.registry.getDefinition(key) !== undefined,
      isSecret: (key) => this.isSecret(key),
      newId: () => randomUUID(),
      capturedAt: new Date().toISOString(),
    });
    const signatureState = verifyConfigPackageSignature(checksum, signature, readConfigPackageSigningKey());
    const candidates: Partial<
      Record<ConfigPackageReferenceKind, readonly { readonly id: string; readonly key: string }[]>
    > = {};
    for (const item of resolution.items) {
      if (item.status === 'resolved' || !mappableReferenceKinds.includes(item.kind)) continue;
      if (candidates[item.kind] === undefined) candidates[item.kind] = candidateList(index, item.kind);
    }
    const report: ConfigPackageImportReport = {
      header,
      candidates,
      checksum,
      checksumValid: true,
      signature: signatureState,
      items: resolution.items,
      settings: resolution.settings,
      created: resolution.created,
      skipped: resolution.skipped,
      blockingCount: resolution.blockingCount,
      canImport: resolution.snapshot !== null && signatureState !== 'invalid',
    };
    return { pkg, report, resolution };
  }

  private isSecret(key: string): boolean {
    return this.registry.getDefinition(key)?.visibility === 'secret';
  }

  private async environmentName(): Promise<string> {
    const settings = await this.settingsService.getPrivateSettings();
    const value = settings[settingKeys.privateConfigVersioningEnvironmentName];
    return typeof value === 'string' ? value.trim() : '';
  }
}

function candidateList(
  index: ConfigReferenceIndex,
  kind: ConfigPackageReferenceKind,
): readonly { readonly id: string; readonly key: string }[] {
  const source =
    kind === 'organizationalUnit'
      ? index.organizationalUnits
      : kind === 'group'
        ? index.groups
        : kind === 'service'
          ? index.services
          : kind === 'serviceCategory'
            ? index.serviceCategories
            : kind === 'policyPack'
              ? index.policyPacks
              : [];
  return [...source].sort((left, right) => left.key.localeCompare(right.key));
}

function readAppVersion(): string {
  return (process.env.APP_VERSION ?? process.env.SOURCE_COMMIT ?? '').trim().slice(0, 64);
}
