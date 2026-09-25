import { describe, expect, it } from "vitest";
import {
  buildTemplateOverrides,
  findUnknownPlaceholders,
  insertPlaceholder,
  isTemplateModified,
  replaceTemplate,
} from "@/lib/settings/email-template-draft";
import type { EmailTemplateRegistry } from "@/services/email-templates-api";

const content = {
  subject: "Novi tiket: {{ticketTitle}}",
  subjectConfidential: "Novi tiket",
  heading: "Novi tiket",
  body: "Tiket {{ticketNumber}}",
  cta: "Otvori",
  footer: "",
};
const defaults: EmailTemplateRegistry = {
  bs: { "ticket.created": content },
  en: { "ticket.created": { ...content, subject: "New ticket: {{ticketTitle}}" } },
};

describe("email template draft helpers", () => {
  it("finds placeholders the server would refuse", () => {
    expect(
      findUnknownPlaceholders("{{ticketNumber}} {{ password }} {{nope}} {{nope}}", [
        "ticketNumber",
      ]),
    ).toEqual(["password", "nope"]);
    expect(findUnknownPlaceholders("{ticketNumber}", ["ticketNumber"])).toEqual([]);
  });

  it("inserts a placeholder at the caret or over the selection", () => {
    expect(insertPlaceholder("Tiket  je", "ticketNumber", 6, 6)).toEqual({
      value: "Tiket {{ticketNumber}} je",
      caret: 22,
    });
    expect(insertPlaceholder("Tiket XX", "ticketNumber", 6, 8).value).toBe(
      "Tiket {{ticketNumber}}",
    );
    expect(insertPlaceholder("Kraj", "appName", null, null).value).toBe("Kraj{{appName}}");
  });

  it("sends only changed fields", () => {
    const edited = replaceTemplate(defaults, "en", "ticket.created", {
      ...defaults.en["ticket.created"]!,
      heading: "Heads up",
    });
    expect(buildTemplateOverrides(edited, defaults)).toEqual({
      en: { "ticket.created": { heading: "Heads up" } },
    });
    expect(buildTemplateOverrides(defaults, defaults)).toEqual({});
    expect(isTemplateModified(edited.en["ticket.created"]!, defaults.en["ticket.created"]!)).toBe(
      true,
    );
    expect(isTemplateModified(content, content)).toBe(false);
  });
});
