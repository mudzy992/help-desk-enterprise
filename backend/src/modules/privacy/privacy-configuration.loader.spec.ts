import { settingKeys } from "../settings/setting-keys";
import { PrivacyConfigurationLoader } from "./privacy-configuration.loader";

describe("PrivacyConfigurationLoader asset-transfer retention", () => {
  it("defaults to disabled and accepts only a positive whole-day period", async () => {
    const values: Record<string, unknown> = {};
    const settings = {
      getSetting: jest.fn(async (key: string) => values[key]),
    };
    const loader = new PrivacyConfigurationLoader(settings as never);

    await expect(loader.load()).resolves.toMatchObject({
      retentionDays: { assetTransfers: 0 },
    });

    values[settingKeys.privatePrivacyRetentionAssetTransfersDays] = 1;
    await expect(loader.load()).resolves.toMatchObject({
      retentionDays: { assetTransfers: 1 },
    });

    values[settingKeys.privatePrivacyRetentionAssetTransfersDays] = 0.5;
    await expect(loader.load()).resolves.toMatchObject({
      retentionDays: { assetTransfers: 0 },
    });
  });
});

describe("PrivacyConfigurationLoader email-delivery retention", () => {
  it("defaults to 180 days and honors the configured period and explicit disable", async () => {
    const values: Record<string, unknown> = {};
    const settings = {
      getSetting: jest.fn(async (key: string) => values[key]),
    };
    const loader = new PrivacyConfigurationLoader(settings as never);
    const key = settingKeys.privatePrivacyRetentionEmailDeliveryDays;

    await expect(loader.load()).resolves.toMatchObject({
      retentionDays: { emailDeliveries: 180 },
    });

    values[key] = 365;
    await expect(loader.load()).resolves.toMatchObject({
      retentionDays: { emailDeliveries: 365 },
    });

    values[key] = 29;
    await expect(loader.load()).resolves.toMatchObject({
      retentionDays: { emailDeliveries: 0 },
    });

    values[key] = 0;
    await expect(loader.load()).resolves.toMatchObject({
      retentionDays: { emailDeliveries: 0 },
    });
  });
});
