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
