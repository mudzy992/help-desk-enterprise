import { describe, expect, it, vi } from "vitest";
import {
  isEditingWithin,
  parseAdminConfigEvent,
  publishAdminConfigEvent,
  queryKeysForAdminConfigDomain,
  subscribeAdminConfigEvents,
} from "./admin-config-events";
import { queryKeys } from "@/lib/query/query-keys";

describe("admin config events (paket 1.7 R3)", () => {
  it("parses only known domains", () => {
    expect(parseAdminConfigEvent({ domain: "sla", action: "delete", actorName: "Emir" })).toMatchObject({
      domain: "sla",
      action: "delete",
      actorName: "Emir",
    });
    expect(parseAdminConfigEvent({ domain: "users" })).toBeNull();
    expect(parseAdminConfigEvent(null)).toBeNull();
  });

  it("maps domains to the query caches they feed", () => {
    expect(queryKeysForAdminConfigDomain("routing")).toContainEqual(queryKeys.routingRules);
    expect(queryKeysForAdminConfigDomain("catalog")).toContainEqual(queryKeys.offeredServices);
    expect(queryKeysForAdminConfigDomain("sla")).toEqual([queryKeys.slaSummary]);
  });

  it("delivers published events to subscribers until they stop", () => {
    const listener = vi.fn();
    const stop = subscribeAdminConfigEvents(listener);
    const event = parseAdminConfigEvent({ domain: "groups" });
    publishAdminConfigEvent(event!);
    stop();
    publishAdminConfigEvent(event!);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("treats an open dialog or a focused field inside the screen as editing", () => {
    const input = { tagName: "INPUT", isContentEditable: false };
    const container = { contains: (node: unknown) => node === input } as unknown as HTMLElement;
    const doc = (dialog: boolean, active: unknown) =>
      ({ querySelector: () => (dialog ? {} : null), activeElement: active }) as unknown as Document;
    expect(isEditingWithin(container, doc(true, null))).toBe(true);
    expect(isEditingWithin(container, doc(false, input))).toBe(true);
    expect(isEditingWithin(container, doc(false, { tagName: "BUTTON" }))).toBe(false);
    expect(isEditingWithin(null, doc(false, input))).toBe(false);
  });
});
