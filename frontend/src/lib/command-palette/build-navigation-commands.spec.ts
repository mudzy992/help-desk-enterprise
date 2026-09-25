import { describe, expect, it } from "vitest";
import {
  buildNavigationCommands,
  filterNavigationCommands,
} from "@/lib/command-palette/build-navigation-commands";
import {
  navigationSections,
  type NavigationLabelKey,
  type NavigationSectionKey,
} from "@/lib/navigation";

const labels: Record<NavigationLabelKey, string> = {
  "navigation.dashboard": "Nadzorna ploča",
  "navigation.reports": "Izvještaji",
  "navigation.tickets": "Svi tiketi",
  "navigation.inbox": "Grupni inbox",
  "navigation.services": "Katalog usluga",
  "navigation.knowledgeBase": "Baza znanja",
  "navigation.routing": "Usmjeravanje",
  "navigation.sla": "SLA",
  "navigation.admin": "Administracija",
  "navigation.configVersions": "Verzije konfiguracije",
  "navigation.workflow": "Tok statusa",
};

const sectionLabels: Record<NavigationSectionKey, string> = {
  "navigation.sections.overview": "Pregled",
  "navigation.sections.tickets": "Tiketi",
  "navigation.sections.services": "Usluge i znanje",
  "navigation.sections.administration": "Administracija",
};

const translate = (key: NavigationLabelKey) => labels[key];
const translateSection = (key: NavigationSectionKey) => sectionLabels[key];

describe("buildNavigationCommands", () => {
  it("flattens every sidebar section in sidebar order", () => {
    const commands = buildNavigationCommands(navigationSections);
    expect(commands).toHaveLength(
      navigationSections.reduce((total, section) => total + section.items.length, 0),
    );
    expect(commands[0]?.path).toBe("/");
    expect(commands[1]?.path).toBe("/reports");
  });

  it("carries the owning section so the palette can group results", () => {
    const commands = buildNavigationCommands(navigationSections);
    const sla = commands.find((command) => command.path === "/sla");
    expect(sla?.sectionLabelKey).toBe("navigation.sections.administration");
  });

  it("produces a unique id per destination", () => {
    const ids = buildNavigationCommands(navigationSections).map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("filterNavigationCommands", () => {
  const commands = buildNavigationCommands(navigationSections);
  const filter = (query: string) =>
    filterNavigationCommands(commands, query, translate, translateSection);

  it("returns everything, in sidebar order, for an empty query", () => {
    expect(filter("")).toEqual(commands);
    expect(filter("   ")).toEqual(commands);
  });

  it("matches case-insensitively on the translated label", () => {
    expect(filter("sla").map((command) => command.path)).toEqual(["/sla"]);
    expect(filter("BAZA").map((command) => command.path)).toEqual(["/knowledge-base"]);
  });

  it("ranks a prefix match above a contained match", () => {
    // "tiketi" is contained in "Svi tiketi"; "Tiketi" only names a section.
    const paths = filter("tiketi").map((command) => command.path);
    expect(paths[0]).toBe("/tickets?view=all");
  });

  it("falls back to the section name when no label matches", () => {
    const paths = filter("pregled").map((command) => command.path);
    expect(paths).toEqual(["/", "/reports"]);
  });

  it("returns nothing when neither label nor section matches", () => {
    expect(filter("nema-ovoga")).toEqual([]);
  });

  it("sorts by rank first, then by sidebar order inside a rank", () => {
    // "ja" is contained in "Baza znanja" and "Administracija" (rank 2), and
    // names the section "Administracija" (rank 3) for the remaining admin rows.
    const paths = filter("ja").map((command) => command.path);

    // rank 2 — both contain the query; ties keep sidebar order.
    expect(paths.slice(0, 2)).toEqual(["/knowledge-base", "/admin"]);
    // rank 3 — matched only through their section, still in sidebar order.
    expect(paths.slice(2)).toEqual([
      "/routing",
      "/sla",
      "/admin/workflow",
      "/admin/config-versions",
    ]);
  });

  it("never places a weaker match before a stronger one", () => {
    const paths = filter("a").map((command) => command.path);

    // Only "Administracija" starts with "a" (rank 1) — it must lead, even though
    // it sits far below "Nadzorna ploča", which merely contains "a" (rank 2).
    expect(paths[0]).toBe("/admin");
    expect(paths[1]).toBe("/");
    expect(paths.length).toBeGreaterThan(2);
  });
});
