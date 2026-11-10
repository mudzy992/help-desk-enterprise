import type { Prisma } from "../../generated/prisma/client";
import { createSettingsRegistry } from "../settings/registry/create-settings-registry";
import { settingKeys } from "../settings/setting-keys";
import { loadCurrentServiceLifecycleConfiguration } from "./load-current-service-lifecycle-configuration";

const registry = createSettingsRegistry([]);

describe("loadCurrentServiceLifecycleConfiguration", () => {
  it("reads the live lifecycle policy from the transaction rather than the candidate snapshot", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { key: settingKeys.privateServicesLifecycleEnabled, value: false },
      {
        key: settingKeys.privateServicesLifecycleAllowedStatesCsv,
        value: "DRAFT,ACTIVE",
      },
      {
        key: settingKeys.privateServicesLifecycleDefaultStateOnCreate,
        value: "DRAFT",
      },
    ]);
    const transaction = {
      appSetting: { findMany },
    } as unknown as Prisma.TransactionClient;

    await expect(
      loadCurrentServiceLifecycleConfiguration(transaction, registry),
    ).resolves.toEqual({
      enabled: false,
      allowedStates: ["DRAFT", "ACTIVE"],
      defaultStateOnCreate: "DRAFT",
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: [
            settingKeys.privateServicesLifecycleEnabled,
            settingKeys.privateServicesLifecycleAllowedStatesCsv,
            settingKeys.privateServicesLifecycleDefaultStateOnCreate,
          ],
        },
      },
      select: { key: true, value: true },
    });
  });
});
