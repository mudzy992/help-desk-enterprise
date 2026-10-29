import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSecurityPointerCard } from "@/components/settings/admin-security-pointer-card";

/*
  the review found „Postavke → Sigurnost" holding only the
  compliance rows while the actionable cards lived elsewhere. The two surfaces
  are now separate on purpose, so the Postavke tab ends with one row that says
  where they are and takes a SuperAdmin there — and the destination is the exact
  deep link the admin shell understands.

  The shell owns real navigation, so `Link` is reduced to an anchor that carries
  whatever `to` the card passes: that is the whole claim under test, and it keeps
  the spec free of a router the surface does not need.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router-dom");
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children?: React.ReactNode }) => (
      <a href={to} data-link-to={to}>
        {children}
      </a>
    ),
  };
});

describe("AdminSecurityPointerCard", () => {
  it("explains where the security administration is", () => {
    const html = renderToStaticMarkup(<AdminSecurityPointerCard />);
    expect(html).toContain("settings.securityPointer.title");
    expect(html).toContain("settings.securityPointer.body");
    expect(html).toContain("settings.securityPointer.open");
  });

  it("links to the security tab of the admin shell", () => {
    const html = renderToStaticMarkup(<AdminSecurityPointerCard />);
    expect(html).toContain('href="/admin?tab=security"');
    expect(html).toContain("<a ");
    // No form, no inline value — the card is a signpost only.
    expect(html).not.toContain("<input");
  });
});
