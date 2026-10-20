import { describe, expect, it } from "vitest";
import {
  canonicalizeServiceCatalogUrl,
  parseServiceCatalogUrl,
  updateServiceCatalogUrl,
} from "@/lib/services/service-catalog-url-state";

describe("service catalog URL state", () => {
  it("parses validated filters and a service workspace", () => {
    expect(
      parseServiceCatalogUrl(
        new URLSearchParams(
          "q=mail&category=cat-1&lifecycle=ACTIVE&originUnit=ou-1&workspace=edit&service=svc-1",
        ),
      ),
    ).toEqual({
      query: "mail",
      categoryId: "cat-1",
      lifecycle: "ACTIVE",
      originUnitId: "ou-1",
      workspace: "edit",
      serviceId: "svc-1",
    });
  });

  it("rejects unknown enum values and service ids without a service workspace", () => {
    expect(
      parseServiceCatalogUrl(new URLSearchParams("lifecycle=NOPE&workspace=wat&service=x")),
    ).toMatchObject({
      lifecycle: "ALL",
      workspace: null,
      serviceId: null,
    });
  });

  it("updates owned keys while preserving unrelated parameters", () => {
    const next = updateServiceCatalogUrl(new URLSearchParams("tab=a&category=old"), {
      categoryId: null,
      lifecycle: "DRAFT",
      workspace: "form",
      serviceId: "svc-2",
    });
    expect(next.toString()).toBe("tab=a&lifecycle=DRAFT&workspace=form&service=svc-2");
  });

  it("canonicalizes unavailable post-load ids without touching valid scope", () => {
    expect(
      canonicalizeServiceCatalogUrl(
        {
          query: "mail",
          categoryId: "missing",
          lifecycle: "ACTIVE",
          originUnitId: "ou-1",
          workspace: "edit",
          serviceId: "missing-service",
        },
        {
          categoryIds: new Set(["cat-1"]),
          originUnitIds: new Set(["ou-1"]),
          serviceIds: new Set(["svc-1"]),
        },
      ),
    ).toEqual({ categoryId: null, workspace: null, serviceId: null });
  });
});
