import { Logger } from "@nestjs/common";
import { settingKeys } from "../../settings/setting-keys";
import { emailDeliveryStatuses } from "../../notifications/email/email-template.constants";
import { AssetRemindersService } from "./asset-reminders.service";
import type { EmailChannelConfiguration } from "../../notifications/email/load-email-channel-configuration";

jest.mock("../../notifications/fan-out/persist-in-app-notification", () => ({
  persistInAppNotification: jest.fn().mockResolvedValue({ id: "n1" }),
}));
jest.mock("../../notifications/preferences/resolve-delivery-decisions", () => ({
  resolveDeliveryDecisions: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock("../../notifications/email/load-email-channel-configuration", () => ({
  loadEmailChannelConfiguration: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../notifications/email/deliver-notification-email", () => ({
  deliverNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./compose-asset-reminder-email", () => ({
  assetReminderSummary: jest.fn(
    (_locale: string, count: number) => `${count} item`,
  ),
  composeAssetReminderEmail: jest.fn(() => ({
    subject: "Expiry reminder",
    text: "Items are expiring.",
    html: "<p>Items are expiring.</p>",
    messageId: "<asset-reminder@example.com>",
    headers: {},
  })),
}));

const { persistInAppNotification } = jest.requireMock(
  "../../notifications/fan-out/persist-in-app-notification",
) as {
  persistInAppNotification: jest.Mock;
};
const { resolveDeliveryDecisions } = jest.requireMock(
  "../../notifications/preferences/resolve-delivery-decisions",
) as {
  resolveDeliveryDecisions: jest.Mock;
};
const { loadEmailChannelConfiguration } = jest.requireMock(
  "../../notifications/email/load-email-channel-configuration",
) as {
  loadEmailChannelConfiguration: jest.Mock;
};
const { deliverNotificationEmail } = jest.requireMock(
  "../../notifications/email/deliver-notification-email",
) as {
  deliverNotificationEmail: jest.Mock;
};
const composeReminder = jest.requireMock("./compose-asset-reminder-email")
  .composeAssetReminderEmail as jest.Mock;

const now = new Date("2026-10-01T08:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

function role(key: string, permissions: string[], ouPath: string | null) {
  return {
    organizationalUnit: ouPath === null ? null : { ouPath },
    role: {
      key,
      rolePermissions: permissions.map((permission) => ({
        permission: { key: permission },
      })),
    },
  };
}

function defaultRecipients() {
  return [
    {
      id: "u-in",
      email: "in@example.com",
      displayName: "In",
      preferredLocale: "bs",
      organizationalUnit: null,
      userRoles: [role("AGENT", ["asset.manage"], "/root")],
    },
    {
      id: "u-out",
      email: "out@example.com",
      displayName: "Out",
      preferredLocale: "bs",
      organizationalUnit: null,
      userRoles: [role("AGENT", ["asset.manage"], "/root/mo")],
    },
    {
      id: "u-lic",
      email: "lic@example.com",
      displayName: "Lic",
      preferredLocale: "bs",
      organizationalUnit: null,
      userRoles: [role("ASSET_MANAGER", ["asset.license.manage"], "/root")],
    },
    {
      id: "u-admin",
      email: "admin@example.com",
      displayName: "Admin",
      preferredLocale: "en",
      organizationalUnit: null,
      userRoles: [role("ADMIN", [], null)],
    },
  ];
}

function build(settings: Record<string, unknown>) {
  const assetUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const contractUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const licenseUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const users = jest.fn().mockResolvedValue(defaultRecipients());
  const reminderDelivery = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "extra-delivery-1" }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    asset: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "a1",
          assetTag: "PC-1",
          name: "Laptop",
          warrantyEndsAt: inDays(6),
          warrantyRemindersSent: [],
          retiredAt: null,
          organizationalUnit: { name: "Sarajevo", ouPath: "/root/sa" },
        },
      ]),
      updateMany: assetUpdateMany,
    },
    assetContract: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: contractUpdateMany,
    },
    softwareLicense: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: licenseUpdateMany,
    },
    user: { findMany: users },
    notificationEmailDelivery: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: emailDeliveryStatuses.sent }),
    },
    assetReminderEmailDelivery: reminderDelivery,
    $transaction: jest
      .fn()
      .mockImplementation((operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
  };
  const settingsService = {
    getSetting: jest.fn(async (key: string) => settings[key]),
    getSecretForInternalUse: jest.fn(async (key: string) => settings[key]),
  };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new AssetRemindersService(
    prisma as never,
    settingsService as never,
    mail as never,
  );
  return {
    service,
    prisma,
    users,
    reminderDelivery,
    updates: {
      asset: assetUpdateMany,
      contract: contractUpdateMany,
      license: licenseUpdateMany,
    },
    mail,
  };
}

function emailChannel(): EmailChannelConfiguration {
  return {
    deliveryEnabled: true,
    smtpEnabled: true,
    emailAddonEnabled: true,
    notificationsEmailEnabled: true,
    slaEscalationEmailEnabled: false,
    templatesEnabled: false,
    internalOnly: true,
    internalDomains: ["example.com"],
    allowedExternalDomains: [],
    allowedExternalEmails: [],
    templates: {} as EmailChannelConfiguration["templates"],
    smtp: {
      host: "smtp.example.com",
      port: 587,
      tls: true,
      username: "reminders",
      password: "secret",
      fromAddress: "desk@example.com",
      provider: "smtp",
    },
    presentation: {
      appName: "Service Desk",
      publicUrl: null,
      accentColor: "#123456",
      includeMessageExcerpt: true,
      replyMode: "no_reply",
      configuredReplyMode: "no_reply",
      replyToAddress: null,
      defaultLocale: "bs",
      fallbackLocale: "en",
      supportedLocales: ["bs", "en"],
    },
  };
}

describe("AssetRemindersService (paket 3.2 §10)", () => {
  beforeEach(() => {
    persistInAppNotification.mockReset().mockResolvedValue({ id: "n1" });
    resolveDeliveryDecisions.mockReset().mockResolvedValue(new Map());
    loadEmailChannelConfiguration.mockReset().mockResolvedValue(null);
    deliverNotificationEmail.mockReset().mockResolvedValue(undefined);
    composeReminder.mockReset().mockReturnValue({
      subject: "Expiry reminder",
      text: "Items are expiring.",
      html: "<p>Items are expiring.</p>",
      messageId: "<asset-reminder@example.com>",
      headers: {},
    });
  });

  it("does nothing while the module is off", async () => {
    const { service, prisma } = build({});
    await expect(service.run(now)).resolves.toMatchObject({
      skipped: "module_disabled",
    });
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it("does not advance thresholds when no responsible recipient is in scope", async () => {
    const { service, prisma, updates } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
    });
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.run(now, { ignoreHour: true })).resolves.toMatchObject(
      {
        skipped: null,
        items: 1,
        recipients: 0,
        emails: 0,
        inApp: 0,
      },
    );
    expect(updates.asset).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("leaves thresholds pending when every responsible recipient has opted out of both channels", async () => {
    const { service, users, updates, mail } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
      [settingKeys.privateAssetsRemindersRecipients]: "ops@example.com",
    });
    const recipients = defaultRecipients();
    users.mockResolvedValue(recipients);
    resolveDeliveryDecisions.mockResolvedValue(
      new Map(
        recipients.map((recipient) => [
          recipient.id,
          { inApp: false, email: "OFF", quiet: false },
        ]),
      ),
    );
    loadEmailChannelConfiguration.mockResolvedValue(emailChannel());

    await service.run(now, { ignoreHour: true });

    expect(persistInAppNotification).not.toHaveBeenCalled();
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(updates.asset).not.toHaveBeenCalled();
  });

  it("notifies scoped managers and advances thresholds for delivered assets, contracts, and licenses", async () => {
    const { service, prisma, updates } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
    });
    prisma.assetContract.findMany.mockResolvedValue([
      {
        id: "c1",
        supplier: "Acme",
        reference: "C-1",
        endsAt: inDays(6),
        remindersSent: [],
        organizationalUnit: { name: "Sarajevo", ouPath: "/root/sa" },
      },
    ]);
    prisma.softwareLicense.findMany.mockResolvedValue([
      {
        id: "l1",
        productName: "Office",
        vendor: "Acme",
        validUntil: inDays(6),
        remindersSent: [],
        organizationalUnit: { name: "Sarajevo", ouPath: "/root/sa" },
      },
    ]);

    const result = await service.run(now, { ignoreHour: true });
    expect(result).toMatchObject({
      skipped: null,
      items: 3,
      recipients: 3,
      inApp: 3,
    });
    const notified = persistInAppNotification.mock.calls
      .map(([, input]) => (input as { userId: string }).userId)
      .sort();
    // u-out: other branch; u-lic covers only licenses, not warranties/contracts.
    expect(notified).toEqual(["u-admin", "u-in", "u-lic"]);
    expect(updates.asset).toHaveBeenCalledWith({
      where: {
        id: "a1",
        retiredAt: null,
        warrantyEndsAt: inDays(6),
        warrantyRemindersSent: { equals: [] },
      },
      data: { warrantyRemindersSent: [30, 7] },
    });
    expect(updates.contract).toHaveBeenCalledWith({
      where: {
        id: "c1",
        endsAt: inDays(6),
        remindersSent: { equals: [] },
      },
      data: { remindersSent: [30, 7] },
    });
    expect(updates.license).toHaveBeenCalledWith({
      where: {
        id: "l1",
        validUntil: inDays(6),
        remindersSent: { equals: [] },
      },
      data: { remindersSent: [30, 7] },
    });
  });

  it("blocks only the thresholds for items whose scoped recipient delivery failed", async () => {
    const { service, prisma, updates } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
    });
    prisma.softwareLicense.findMany.mockResolvedValue([
      {
        id: "l1",
        productName: "Office",
        vendor: "Acme",
        validUntil: inDays(6),
        remindersSent: [],
        organizationalUnit: { name: "Sarajevo", ouPath: "/root/sa" },
      },
    ]);
    persistInAppNotification
      .mockResolvedValueOnce({ id: "n-in" })
      .mockRejectedValueOnce(new Error("license manager unavailable"))
      .mockResolvedValueOnce({ id: "n-admin" });

    await service.run(now, { ignoreHour: true });

    expect(updates.asset).toHaveBeenCalledTimes(1);
    expect(updates.license).not.toHaveBeenCalled();
  });

  it("lets a successful extra internal email satisfy a threshold when no scoped manager exists", async () => {
    const { service, prisma, updates, mail, reminderDelivery } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
      [settingKeys.privateAssetsRemindersRecipients]: " Ops@example.com,ops@example.com ",
    });
    prisma.user.findMany.mockResolvedValue([]);
    loadEmailChannelConfiguration.mockResolvedValue(emailChannel());

    const result = await service.run(now, { ignoreHour: true });

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(result.emails).toBe(1);
    expect(updates.asset).toHaveBeenCalledTimes(1);
    expect(reminderDelivery.create).toHaveBeenCalledTimes(1);
    expect(reminderDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        dedupeKey: expect.stringMatching(/^asset-expiring:[a-f0-9]{32}$/u),
        status: "CLAIMED",
        attempts: 1,
        claimToken: expect.any(String),
      }),
    });
    expect(reminderDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "CLAIMED",
          claimToken: expect.any(String),
        }),
        data: expect.objectContaining({ status: "SENT", claimToken: null }),
      }),
    );
    expect(reminderDelivery.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      "toAddress",
    );
  });

  it("uses a prior SENT extra-recipient record to finish a marker retry without resending", async () => {
    const { service, prisma, updates, mail, reminderDelivery } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
      [settingKeys.privateAssetsRemindersRecipients]: "ops@example.com",
    });
    prisma.user.findMany.mockResolvedValue([]);
    loadEmailChannelConfiguration.mockResolvedValue(emailChannel());
    reminderDelivery.findUnique.mockResolvedValue({ status: "SENT" });

    const result = await service.run(now, { ignoreHour: true });

    expect(result.emails).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    expect(reminderDelivery.create).not.toHaveBeenCalled();
    expect(updates.asset).toHaveBeenCalledTimes(1);
  });

  it("leaves unscoped thresholds pending when every extra internal email fails", async () => {
    const { service, prisma, updates, mail, reminderDelivery } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
      [settingKeys.privateAssetsRemindersRecipients]: "ops@example.com",
    });
    prisma.user.findMany.mockResolvedValue([]);
    loadEmailChannelConfiguration.mockResolvedValue(emailChannel());
    mail.send.mockRejectedValueOnce(new Error("SMTP unavailable for ops@example.com: message body"));
    const warning = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    try {
      await service.run(now, { ignoreHour: true });
      expect(warning).toHaveBeenCalledWith("asset_reminder_extra_failed");
      expect(warning.mock.calls.flat().join(" ")).not.toContain("ops@example.com");
    } finally {
      warning.mockRestore();
    }

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(updates.asset).not.toHaveBeenCalled();
    expect(reminderDelivery.create).toHaveBeenCalledTimes(1);
    expect(reminderDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "CLAIMED",
          claimToken: expect.any(String),
        }),
        data: expect.objectContaining({ status: "FAILED", claimToken: null }),
      }),
    );
  });

  it("keeps the item threshold pending after a partial delivery and retries only the failed recipient semantically", async () => {
    const { service, updates } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
    });
    persistInAppNotification
      .mockResolvedValueOnce({ id: "n-in" })
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "n-admin" });

    const first = await service.run(now, { ignoreHour: true });
    expect(first.inApp).toBe(1);
    expect(updates.asset).not.toHaveBeenCalled();
    const firstDedupeKey = (
      persistInAppNotification.mock.calls[0]?.[1] as { dedupeKey: string }
    ).dedupeKey;

    const second = await service.run(now, { ignoreHour: true });
    expect(second.inApp).toBe(1);
    expect(updates.asset).toHaveBeenCalledTimes(1);
    const retryDedupeKey = (
      persistInAppNotification.mock.calls[2]?.[1] as { dedupeKey: string }
    ).dedupeKey;
    expect(retryDedupeKey).toBe(firstDedupeKey);
  });

  it("marks a threshold after confirmed email delivery, not merely after invoking the mail helper", async () => {
    const { service, prisma, users, updates } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
    });
    const recipient = defaultRecipients()[0]!;
    users.mockResolvedValue([recipient]);
    resolveDeliveryDecisions.mockResolvedValue(
      new Map([
        [recipient.id, { inApp: false, email: "IMMEDIATE", quiet: false }],
      ]),
    );
    loadEmailChannelConfiguration.mockResolvedValue(emailChannel());

    const result = await service.run(now, { ignoreHour: true });

    expect(deliverNotificationEmail).toHaveBeenCalledTimes(1);
    expect(prisma.notificationEmailDelivery.findUnique).toHaveBeenCalledWith({
      where: {
        userId_dedupeKey: {
          userId: recipient.id,
          dedupeKey: expect.stringMatching(/^asset-expiring:[a-f0-9]{32}$/),
        },
      },
      select: { status: true },
    });
    expect(result.emails).toBe(1);
    expect(updates.asset).toHaveBeenCalledTimes(1);
  });

  it("does not advance a threshold while an e-mail claim is still pending", async () => {
    const { service, prisma, users, updates } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
    });
    const recipient = defaultRecipients()[0]!;
    users.mockResolvedValue([recipient]);
    resolveDeliveryDecisions.mockResolvedValue(
      new Map([
        [recipient.id, { inApp: false, email: "IMMEDIATE", quiet: false }],
      ]),
    );
    loadEmailChannelConfiguration.mockResolvedValue(emailChannel());
    prisma.notificationEmailDelivery.findUnique.mockResolvedValue({
      status: "CLAIMED",
    });

    await service.run(now, { ignoreHour: true });

    expect(updates.asset).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not advance thresholds when in-app and e-mail delivery both fail", async () => {
    const { service, users, updates } = build({
      [settingKeys.privateAddonsCmdb]: true,
      [settingKeys.privateAssetsRemindersDaysBefore]: "30,7",
    });
    const recipient = defaultRecipients()[0]!;
    users.mockResolvedValue([recipient]);
    resolveDeliveryDecisions.mockResolvedValue(
      new Map([
        [recipient.id, { inApp: true, email: "IMMEDIATE", quiet: false }],
      ]),
    );
    loadEmailChannelConfiguration.mockResolvedValue(emailChannel());
    persistInAppNotification.mockRejectedValueOnce(
      new Error("notification storage failed"),
    );
    deliverNotificationEmail.mockRejectedValueOnce(
      new Error("SMTP unavailable"),
    );

    await service.run(now, { ignoreHour: true });

    expect(updates.asset).not.toHaveBeenCalled();
  });
});
