import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staffSelectableTicketStatusTransitions } from "@/lib/tickets/ticket-constants";
import type { TicketStatus } from "@/services/tickets-api";

const backendDefinition = new URL(
  "../../../../backend/src/modules/tickets/workflow/ticket-workflow-definition.ts",
  import.meta.url,
);

/**
 * The ticket status picker intentionally exposes only direct STAFF edges except dedicated reopen edges. Approval, automation and reopen have dedicated flows.
 * Reading the backend definition makes backend graph changes fail frontend CI
 * until this explicit product filter is reviewed.
 */
function staffStatusChangeEdgesFromBackend(): Record<TicketStatus, TicketStatus[]> {
  const source = readFileSync(backendDefinition, "utf8");
  const statuses = Object.keys(staffSelectableTicketStatusTransitions) as TicketStatus[];
  const result = Object.fromEntries(statuses.map((status) => [status, []])) as Record<
    TicketStatus,
    TicketStatus[]
  >;
  for (const match of source.matchAll(/\{\s*from:\s*'([^']+)',\s*to:\s*'([^']+)',([\s\S]*?)\}/g)) {
    const [, from, to, body] = match;
    if (
      statuses.includes(from as TicketStatus) &&
      statuses.includes(to as TicketStatus) &&
      /actors:\s*\[[^\]]*'STAFF'/.test(body ?? "") &&
      !/triggers:\s*\[[^\]]*'reopen'/.test(body ?? "")
    ) {
      result[from as TicketStatus].push(to as TicketStatus);
    }
  }
  return result;
}

describe("ticket status picker / backend workflow parity", () => {
  it("matches every directly selectable STAFF edge and excludes dedicated flows", () => {
    expect(staffSelectableTicketStatusTransitions).toEqual(staffStatusChangeEdgesFromBackend());
  });
});
