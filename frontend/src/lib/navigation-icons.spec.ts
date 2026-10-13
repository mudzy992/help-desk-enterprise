import { describe, expect, it } from "vitest";
import { hasNavigationIcon, navigationIconFor } from "@/lib/navigation-icons";
import { LayoutDashboard } from "lucide-react";
import { primaryNavigationItems } from "@/lib/navigation";

describe("navigation icons", () => {
  it("has an explicit icon for every sidebar destination", () => {
    const missing = primaryNavigationItems
      .map((item) => item.path)
      .filter((path) => !hasNavigationIcon(path));

    expect(missing).toEqual([]);
  });

  it("falls back to the dashboard icon only for unknown paths", () => {
    expect(navigationIconFor("/does-not-exist")).toBe(LayoutDashboard);
  });

  it("gives the docs destination its own icon", () => {
    expect(navigationIconFor("/docs")).not.toBe(LayoutDashboard);
  });
});
