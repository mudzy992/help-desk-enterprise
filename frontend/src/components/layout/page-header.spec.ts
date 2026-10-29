import { describe, expect, it } from "vitest";
import {
  brandCrumb,
  resolvePageHeaderCrumbs,
  type PageHeaderCrumb,
} from "@/components/layout/page-header";

describe("PageHeader crumb model", () => {
  it("resolves only the explicit brand variant to the configured application name", () => {
    const crumbs: readonly PageHeaderCrumb[] = [brandCrumb, "Administration"];
    expect(resolvePageHeaderCrumbs(crumbs, "Pulse Desk")).toEqual(["Pulse Desk", "Administration"]);
  });

  it("keeps arbitrary text intact, including the value of the removed string sentinel", () => {
    expect(resolvePageHeaderCrumbs(["\u0000brand"], "Pulse Desk")).toEqual(["\u0000brand"]);
  });
});
