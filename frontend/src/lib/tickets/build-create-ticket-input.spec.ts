import { describe, expect, it } from "vitest";
import {
  buildCreateTicketInput,
  isCreateTicketDraftReady,
  isServiceReadyForTicketCreation,
  knowledgeInterceptQuery,
} from "@/lib/tickets/build-create-ticket-input";

const draft = {
  title: " VPN issue ",
  description: " Cannot connect ",
  impact: "HIGH" as const,
  urgency: "MEDIUM" as const,
  serviceId: "svc-1",
  originUnitId: " ou-it ",
  formVersionRef: "form-1",
  formData: { hostname: "pc-1" },
};

describe("buildCreateTicketInput", () => {
  it("builds the ticket API payload and keeps intercept optional", () => {
    expect(isCreateTicketDraftReady(draft)).toBe(true);
    expect(isCreateTicketDraftReady({ ...draft, title: " " })).toBe(false);
    expect(isCreateTicketDraftReady({ ...draft, originUnitId: " " })).toBe(false);
    expect(buildCreateTicketInput(draft)).toEqual({
      title: "VPN issue",
      description: "Cannot connect",
      impact: "HIGH",
      urgency: "MEDIUM",
      serviceId: "svc-1",
      originUnitId: "ou-it",
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
      originUnitId: "ou-it",
    });
  });

  it("omits originUnitId when empty so the backend can resolve the user home unit", () => {
    expect(
      buildCreateTicketInput({
        ...draft,
        originUnitId: "  ",
        formVersionRef: null,
        formData: {},
      }),
    ).toEqual({
      title: "VPN issue",
      description: "Cannot connect",
      impact: "HIGH",
      urgency: "MEDIUM",
      serviceId: "svc-1",
    });
    expect(
      isCreateTicketDraftReady(
        { ...draft, originUnitId: "" },
        { isOriginUnitLocked: true },
      ),
    ).toBe(true);
    expect(isCreateTicketDraftReady({ ...draft, originUnitId: "" })).toBe(false);
  });
});

describe("isServiceReadyForTicketCreation", () => {
  it("blocks submission for a selected service without an active form version", () => {
    expect(isServiceReadyForTicketCreation(draft, true)).toBe(true);
    expect(isServiceReadyForTicketCreation(draft, false)).toBe(false);
  });

  it("stays ready while no service is selected yet", () => {
    expect(
      isServiceReadyForTicketCreation({ ...draft, serviceId: "" }, false),
    ).toBe(true);
  });
});
