import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applicationSettings } from './definitions/application-settings';
import {
  defaultObservabilityAuditRetentionDays,
  defaultObservabilityRequestLogRetentionDays,
  defaultSupportBundleRecentLogsMinutes,
} from './definitions/observability-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('observability settings', () => {
  it('defaults support bundle flags on and retention to 90/14/60', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REGISTRY,
          useValue: createSettingsRegistry(applicationSettings),
        },
        {
          provide: PrismaService,
          useValue: { appSetting: { findUnique: jest.fn().mockResolvedValue(null) } },
        },
      ],
    }).compile();
    const service = moduleRef.get(SettingsService);
    expect(
      await service.getSetting(settingKeys.privateObservabilityAuditRetentionDays),
    ).toBe(defaultObservabilityAuditRetentionDays);
    expect(
      await service.getSetting(
        settingKeys.privateObservabilityRequestLogRetentionDays,
      ),
    ).toBe(defaultObservabilityRequestLogRetentionDays);
    expect(
      await service.getSetting(settingKeys.privateObservabilitySupportBundleEnabled),
    ).toBe(true);
    expect(
      await service.getSetting(
        settingKeys.privateObservabilitySupportBundleIncludeConfigSnapshot,
      ),
    ).toBe(true);
    expect(
      await service.getSetting(
        settingKeys.privateObservabilitySupportBundleIncludeRecentLogs,
      ),
    ).toBe(true);
    expect(
      await service.getSetting(
        settingKeys.privateObservabilitySupportBundleIncludeAuditExport,
      ),
    ).toBe(true);
    expect(
      await service.getSetting(
        settingKeys.privateObservabilitySupportBundleRecentLogsMinutes,
      ),
    ).toBe(defaultSupportBundleRecentLogsMinutes);
  });
});
