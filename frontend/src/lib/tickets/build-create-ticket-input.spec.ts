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
  assetId: "",
  requestType: "",
  dueAt: "",
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
    // M8 #3: both fields are optional and absent from the payload when empty.
    expect(buildCreateTicketInput(draft)).not.toHaveProperty("requestType");
    expect(buildCreateTicketInput(draft)).not.toHaveProperty("dueAt");
    expect(
      buildCreateTicketInput({
        ...draft,
        requestType: "  VPN pristup ",
        dueAt: "2026-10-08",
      }),
    ).toMatchObject({
      requestType: "VPN pristup",
      dueAt: new Date("2026-10-08").toISOString(),
    });
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

describe("buildCreateTicketInput asset (paket 3.2 §8)", () => {
  it("sends the chosen own equipment only when set", () => {
    expect(buildCreateTicketInput({ ...draft, assetId: "asset-1" }).assetId).toBe("asset-1");
    expect("assetId" in buildCreateTicketInput(draft)).toBe(false);
  });
});
