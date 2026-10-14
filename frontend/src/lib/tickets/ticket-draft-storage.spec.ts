// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  canPersistCreateTicketDraft,
  clearSessionValue,
  CREATE_TICKET_DRAFT_STORAGE_KEY,
  isPersistedCreateTicketDraft,
  isTicketComposerDraft,
  readSessionValue,
  restorePersistedCreateTicketDraft,
  ticketComposerDraftStorageKey,
  toPersistedCreateTicketDraft,
  writeSessionValue,
} from "@/lib/tickets/ticket-draft-storage";

describe("ticket draft session storage", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("uses an isolated composer key for each ticket", () => {
    expect(ticketComposerDraftStorageKey("ticket/one")).not.toBe(
      ticketComposerDraftStorageKey("ticket-two"),
    );
    expect(ticketComposerDraftStorageKey("ticket/one")).toContain("ticket%2Fone");
  });

  it("round-trips only a validated composer body and mode", () => {
    const key = ticketComposerDraftStorageKey("ticket-1");
    writeSessionValue(key, { body: "Follow up tomorrow", mode: "reply" });

    expect(readSessionValue(key, isTicketComposerDraft)).toEqual({
      body: "Follow up tomorrow",
      mode: "reply",
    });
    writeSessionValue(key, { body: 4, mode: "other" });
    expect(readSessionValue(key, isTicketComposerDraft)).toBeNull();
  });

  it("stores create selections only for internal, non-confidential services", () => {
    const service = {
      id: "svc-internal",
      classification: "INTERNAL",
      isConfidentialDefault: false,
    } as const;
    const draft = {
      serviceId: service.id,
      originUnitId: "unit-1",
      impact: "HIGH",
      urgency: "MEDIUM",
      title: "Private summary must not be saved",
      description: "Sensitive details must not be saved",
      formData: { secret: "do not persist" },
    };

    expect(canPersistCreateTicketDraft(service)).toBe(true);
    const saved = toPersistedCreateTicketDraft(draft, service);
    expect(saved).toEqual({
      serviceId: "svc-internal",
      originUnitId: "unit-1",
      impact: "HIGH",
      urgency: "MEDIUM",
    });
    expect(JSON.stringify(saved)).not.toContain("Private summary");
    expect(JSON.stringify(saved)).not.toContain("Sensitive details");
    expect(JSON.stringify(saved)).not.toContain("secret");
  });

  it.each([
    { id: "svc-confidential", classification: "CONFIDENTIAL", isConfidentialDefault: false },
    { id: "svc-restricted", classification: "RESTRICTED", isConfidentialDefault: false },
    { id: "svc-default-private", classification: "INTERNAL", isConfidentialDefault: true },
  ] as const)("does not persist $classification or confidential-default services", (service) => {
    expect(canPersistCreateTicketDraft(service)).toBe(false);
    expect(
      toPersistedCreateTicketDraft(
        {
          serviceId: service.id,
          originUnitId: "unit-1",
          impact: "LOW",
          urgency: "LOW",
        },
        service,
      ),
    ).toBeNull();
  });

  it("refuses to restore a draft if the service became confidential and clears on submit", () => {
    const saved = {
      serviceId: "svc-internal",
      originUnitId: "unit-1",
      impact: "HIGH",
      urgency: "MEDIUM",
    } as const;
    const internalService = {
      id: "svc-internal",
      classification: "INTERNAL",
      isConfidentialDefault: false,
    } as const;
    const confidentialService = {
      id: "svc-internal",
      classification: "CONFIDENTIAL",
      isConfidentialDefault: false,
    } as const;

    expect(isPersistedCreateTicketDraft(saved)).toBe(true);
    expect(restorePersistedCreateTicketDraft(saved, internalService)).toEqual(saved);
    expect(restorePersistedCreateTicketDraft(saved, confidentialService)).toBeNull();

    writeSessionValue(CREATE_TICKET_DRAFT_STORAGE_KEY, saved);
    clearSessionValue(CREATE_TICKET_DRAFT_STORAGE_KEY);
    expect(
      readSessionValue(CREATE_TICKET_DRAFT_STORAGE_KEY, isPersistedCreateTicketDraft),
    ).toBeNull();
  });
});
