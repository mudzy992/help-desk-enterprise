import { describe, expect, it } from "vitest";
import {
  isEmailTemplateRegistryValid,
  parseEmailTemplateRegistry,
  validateEmailTemplateText,
} from "@/lib/settings/parse-email-template-registry";
import type { EmailTemplateRegistry } from "@/lib/settings/email-template-keys";

const valid: EmailTemplateRegistry = {
  "ticket.created": { subject: "New {{ticketNumber}}", body: "{{ticketTitle}}" },
  "ticket.assigned": { subject: "Assigned {{ticketNumber}}", body: "{{ticketId}}" },
  "ticket.forwarded": { subject: "Forwarded {{ticketNumber}}", body: "{{ticketTitle}}" },
  "ticket.message": { subject: "Message {{ticketNumber}}", body: "{{type}}" },
  "ticket.resolved": { subject: "Resolved {{ticketNumber}}", body: "{{event}}" },
  "ticket.closed": { subject: "Closed {{ticketNumber}}", body: "{{ticketTitle}}" },
  "ticket.approval": { subject: "Approval {{ticketNumber}}", body: "{{ticketTitle}}" },
  "ticket.sla": { subject: "SLA {{ticketNumber}}", body: "{{ticketTitle}}" },
  "remote.requested": { subject: "Remote {{ticketNumber}}", body: "{{ticketTitle}}" },
};

describe("email template validation", () => {
  it("accepts allow-listed placeholders", () => {
    expect(validateEmailTemplateText("Tiket {{ticketNumber}}")).toBe(true);
    expect(isEmailTemplateRegistryValid(valid)).toBe(true);
    expect(parseEmailTemplateRegistry(JSON.stringify(valid))).toEqual(valid);
  });

  it("rejects unknown placeholders and empty text", () => {
    expect(validateEmailTemplateText("Hi {{actorEmail}}")).toBe(false);
    expect(validateEmailTemplateText("   ")).toBe(false);
    expect(
      isEmailTemplateRegistryValid({
        ...valid,
        "ticket.created": { subject: "Hi {{user}}", body: "Body" },
      }),
    ).toBe(false);
  });
});
