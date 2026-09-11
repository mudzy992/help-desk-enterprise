import { describe, expect, it } from "vitest";
import {
  buildCreateTicketInput,
  isCreateTicketDraftReady,
  knowledgeInterceptQuery,
} from "@/lib/tickets/build-create-ticket-input";

const draft = {
  title: " VPN issue ",
  description: " Cannot connect ",
  impact: "HIGH" as const,
  urgency: "MEDIUM" as const,
  serviceId: "svc-1",
  formVersionRef: "form-1",
  formData: { hostname: "pc-1" },
};

describe("buildCreateTicketInput", () => {
  it("builds the ticket API payload and keeps intercept optional", () => {
    expect(isCreateTicketDraftReady(draft)).toBe(true);
    expect(isCreateTicketDraftReady({ ...draft, title: " " })).toBe(false);
    expect(buildCreateTicketInput(draft)).toEqual({
      title: "VPN issue",
      description: "Cannot connect",
      impact: "HIGH",
      urgency: "MEDIUM",
      serviceId: "svc-1",
      formVersionRef: "form-1",
      formData: { hostname: "pc-1" },
    });
    expect(knowledgeInterceptQuery(draft)).toBe("VPN issue Cannot connect");
    expect(buildCreateTicketInput({ ...draft, formVersionRef: null, formData: {} })).toEqual({
      title: "VPN issue",
      description: "Cannot connect",
      impact: "HIGH",
      urgency: "MEDIUM",
      serviceId: "svc-1",
    });
  });
});
