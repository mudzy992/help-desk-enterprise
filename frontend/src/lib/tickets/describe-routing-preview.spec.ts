import { describe, expect, it } from "vitest";
import { describeRoutingPreview } from "@/lib/tickets/describe-routing-preview";
import type { TicketRoutingPreview } from "@/services/tickets-routing-preview-api";

const base: TicketRoutingPreview = {
  outcome: "EXACT",
  groupName: "Service desk",
  fallbackDepth: 0,
  autoAssign: "NONE",
  approvalSteps: 0,
  slaProfileName: null,
};

describe("describeRoutingPreview (val 5, M7 B2)", () => {
  it("names the target group on an exact match", () => {
    expect(describeRoutingPreview(base)).toEqual([
      { key: "tickets.routingPreviewRouted", params: { group: "Service desk" } },
    ]);
  });

  it("reports the fallback depth of a parent match", () => {
    expect(
      describeRoutingPreview({
        ...base,
        outcome: "PARENT_FALLBACK",
        groupName: "IT",
        fallbackDepth: 2,
      }),
    ).toEqual([
      {
        key: "tickets.routingPreviewFallback",
        params: { group: "IT", depth: 2 },
      },
    ]);
  });

  it("keeps the fallback detail line when the outcome is exact but the walk went up", () => {
    expect(
      describeRoutingPreview({ ...base, fallbackDepth: 1 }),
    ).toEqual([
      { key: "tickets.routingPreviewRouted", params: { group: "Service desk" } },
      { key: "tickets.routingPreviewFallbackDepth", params: { depth: 1 } },
    ]);
  });

  it("says the ticket would be unrouted when no rule matches", () => {
    expect(
      describeRoutingPreview({
        ...base,
        outcome: "UNROUTED",
        groupName: null,
      }),
    ).toEqual([{ key: "tickets.routingPreviewUnrouted" }]);
  });

  it("falls back to the unrouted wording when a routed outcome has no group name", () => {
    expect(describeRoutingPreview({ ...base, groupName: null })).toEqual([
      { key: "tickets.routingPreviewUnrouted" },
    ]);
  });

  it("adds the SLA profile when the service has an active one", () => {
    expect(
      describeRoutingPreview({ ...base, slaProfileName: "Standard 8/5" }),
    ).toEqual([
      { key: "tickets.routingPreviewRouted", params: { group: "Service desk" } },
      {
        key: "tickets.routingPreviewSlaProfile",
        params: { profile: "Standard 8/5" },
      },
    ]);
  });
});
