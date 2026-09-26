import { describe, expect, it } from "vitest";
import {
  diffNotificationPreferences,
  quarterHourOptions,
  type NotificationPreferences,
} from "@/services/notification-preferences-api";

const base: NotificationPreferences = {
  categories: [
    {
      key: "ticket.message",
      channels: { inApp: true, email: true },
      alwaysOn: false,
      inApp: true,
      email: "IMMEDIATE",
      inAppLocked: false,
      emailLocked: false,
      customized: false,
      defaults: { inApp: true, email: "IMMEDIATE" },
    },
    {
      key: "ticket.approval",
      channels: { inApp: true, email: true },
      alwaysOn: false,
      inApp: true,
      email: "IMMEDIATE",
      inAppLocked: true,
      emailLocked: true,
      customized: false,
      defaults: { inApp: true, email: "IMMEDIATE" },
    },
  ],
  schedule: {
    quietHoursEnabled: false,
    quietStart: "18:00",
    quietEnd: "07:00",
    quietWeekends: false,
    digestTime: null,
    digestWorkdaysOnly: true,
  },
  policy: {
    preferencesEnabled: true,
    digestEnabled: true,
    quietHoursEnabled: true,
    digestDefaultTime: "07:30",
    timeZone: "Europe/Sarajevo",
    emailChannelAvailable: true,
  },
  digest: { nextAt: null, pendingItems: 0 },
};

describe("notification preferences diff", () => {
  it("sends only changed, unlocked values", () => {
    const draft: NotificationPreferences = {
      ...base,
      categories: base.categories.map((category) => ({ ...category, email: "DIGEST" as const, inApp: false })),
      schedule: { ...base.schedule, quietHoursEnabled: true },
    };
    expect(diffNotificationPreferences(base, draft)).toEqual({
      preferences: [{ category: "ticket.message", inApp: false, email: "DIGEST" }],
      schedule: { quietHoursEnabled: true },
    });
    expect(diffNotificationPreferences(base, base)).toEqual({});
  });

  it("offers 96 quarter-hour values", () => {
    expect(quarterHourOptions).toHaveLength(96);
    expect(quarterHourOptions[30]).toBe("07:30");
  });
});
