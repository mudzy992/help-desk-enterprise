import { describe, expect, it } from "vitest";
import { protectedRoutes } from "@/app/protected-route-catalog";
import { hasNavigationIcon } from "@/lib/navigation-icons";
import { navigationSections } from "@/lib/navigation";
import { navigationAccessKinds } from "@/lib/session/route-access";

const unguardedNavigationKinds = new Set([
  navigationAccessKinds.authenticated,
  navigationAccessKinds.docs,
  navigationAccessKinds.myAssets,
]);

function pathnameOf(path: string): string {
  return path.split("?", 1)[0] ?? path;
}

describe("protected route catalog", () => {
  it("defines unique paths with an available fallback icon", () => {
    const paths = protectedRoutes.map(({ path }) => path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const descriptor of protectedRoutes) {
      expect(hasNavigationIcon(descriptor.iconPath), descriptor.path).toBe(true);
    }
  });

  it("keeps guarded navigation destinations aligned with route access", () => {
    const descriptors = new Map(protectedRoutes.map((route) => [`/${route.path}`, route]));
    for (const item of navigationSections.flatMap(({ items }) => items)) {
      if (unguardedNavigationKinds.has(item.access.kind)) continue;
      const route = descriptors.get(pathnameOf(item.path));
      expect(route, `missing protected route for ${item.path}`).toBeDefined();
      expect(route?.accessKind, item.path).toBe(item.access.kind);
    }
  });

  it("guards asset, problem and change list/detail routes consistently", () => {
    for (const [root, kind] of [
      ["assets", navigationAccessKinds.assets],
      ["problems", navigationAccessKinds.problems],
      ["changes", navigationAccessKinds.changes],
    ] as const) {
      const matches = protectedRoutes.filter(
        ({ path }) => path === root || path.startsWith(`${root}/`),
      );
      expect(matches).toHaveLength(2);
      expect(matches.every(({ accessKind }) => accessKind === kind)).toBe(true);
    }
  });
});
