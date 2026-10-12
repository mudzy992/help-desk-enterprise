import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditMetadataList } from "@/components/admin/audit-metadata-list";

/*
  Item 3/4 of the 2026-10-12 polish round: both audit cards showed the raw
  property name for a field they did not know, and none of them translated a
  value. This component is the single rendering for both, so the spec covers it
  once: labels, translated enums, the untouched free text, and the count of
  hidden rows.
*/
/*
  The mock turns registry keys into short pseudo-labels, so the assertions can
  see the difference between "the label of `ipMaxFailures`" and the raw property
  name — with the key echoed verbatim the two would look alike.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key.startsWith("admin.ops.auditLog.values.")) {
        return `value:${key.slice("admin.ops.auditLog.values.".length)}`;
      }
      const prefix = "admin.ops.auditLog.labels.";
      if (!key.startsWith(prefix)) return key;
      const rest = key.slice(prefix.length);
      if (options !== undefined) return `${rest}|${options.count as number}`;
      if (rest === "unknownField") return "unknown";
      if (rest.startsWith("fields.")) return `field:${rest.slice("fields.".length)}`;
      return rest;
    },
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

const render = (metadata: unknown, visibleCount?: number) =>
  renderToStaticMarkup(<AuditMetadataList metadata={metadata} visibleCount={visibleCount} />);

describe("AuditMetadataList", () => {
  it("prints a dash without details", () => {
    expect(render(null)).toContain("—");
    expect(render({})).toContain("—");
    expect(render({})).not.toContain("admin.ops.auditLog.labels");
  });

  it("translates the field name and an enum value, but not free text", () => {
    const html = render({
      ipMaxFailures: 5,
      ipWindowSeconds: 300,
      reason: 'Nalog je deaktiviran, provjeriti ručno',
      status: "must_change",
    });
    expect(html).toContain("field:ipMaxFailures");
    expect(html).toContain("field:ipWindowSeconds");
    expect(html).toContain("value:status.must_change");
    expect(html).toContain("Nalog je deaktiviran, provjeriti ručno");
    // The visible label is the registry label, never the property name itself.
    expect(html).not.toContain(">ipMaxFailures");
  });

  it("never leaks an unknown property name and collapses the tail", () => {
    const html = render(
      { usedPercent: 83, freeGb: 12, totalGb: 200, someFutureField: 1, anotherFutureField: 2 },
      3,
    );
    expect(html).not.toContain("someFutureField");
    expect(html).toContain("unknown");
    expect(html).toContain("moreDetails|2");
  });

  it("labels a nested path segment by segment and keeps a dotted key unknown", () => {
    expect(render({ filters: { status: "OPEN" } }, 6)).toContain("field:filters · field:status");
    // A key that is itself dotted is not a path — it stays an unknown field.
    expect(render({ "failedByQueue.email": 2 }, 6)).toContain("unknown");
  });
});
