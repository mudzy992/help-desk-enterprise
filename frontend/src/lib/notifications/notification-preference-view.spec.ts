import { describe, expect, it } from "vitest";
import { notificationCategoryLabel, notificationEmailModes } from "./notification-preference-view";

describe("notification preference view model", () => {
  it("keeps channel modes and nested category translation keys stable", () => {
    expect(notificationEmailModes).toEqual(["IMMEDIATE", "DIGEST", "OFF"]);
    expect(notificationCategoryLabel("ticket.assigned")).toBe(
      "account.notifications.categories.ticket_assigned",
    );
  });
});
