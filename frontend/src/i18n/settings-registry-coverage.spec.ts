import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import bosnian from "@/i18n/locales/bs/common.json";
import english from "@/i18n/locales/en/common.json";

/**
 * Paket 5.3.4 (D4/D5): the settings tab shows a human sentence as the title with
 * the raw key underneath, and the detail modal adds an explanation ("what it
 * does, when to switch it on, what the consequence is"). Both slots must exist
 * in BS and EN for **every** registered key, otherwise the screen falls back to
 * the English backend description inside the Bosnian UI, or the modal opens
 * without prose.
 *
 * The guard reads the key catalogue straight from the backend source of truth —
 * `setting-keys.ts` plus the install-wizard addon catalogue that generates
 * `private.addons.*` keys — and fails the frontend job like the permission
 * guard fails the backend job.
 */
type Dictionary = {
  readonly settings: {
    readonly registry: {
      readonly keys: Readonly<Record<string, string>>;
      readonly help: Readonly<Record<string, string>>;
      readonly groups: Readonly<Record<string, Readonly<Record<string, string>>>>;
    };
  };
};

const locales = ["bs", "en"] as const;

const settingsModule = resolve(__dirname, "../../../backend/src/modules/settings");
const keyPrefixes = ["private.", "public."];

function readSource(file: string): string {
  return readFileSync(resolve(settingsModule, file), "utf8");
}

const catalogKeys = [...new Set([...readSource("setting-keys.ts").matchAll(/'((?:private|public)\.[A-Za-z0-9_.]+)'/g)].map((match) => match[1] ?? ""))].filter(
  (key) => keyPrefixes.some((prefix) => key.startsWith(prefix)),
);

/** The catalogue builds `private.addons.*` keys from the addon list at runtime. */
const addonKeys = [...readSource("addon-catalog.ts").matchAll(/\bkey:\s*'([a-zA-Z]+)'/g)].map(
  (match) => `private.addons.${match[1] ?? ""}`,
);

const allKeys = [...new Set([...catalogKeys, ...addonKeys])].sort();

/**
 * Definition files declare `group: '<id>'` for categories that are split into
 * sub-sections (SMTP, Edge extension, Teams). The tab renders
 * `settings.registry.groups.<categoryId>.<groupId>`, so a missing pair would
 * show the raw key to the administrator.
 */
function readDefinitionGroups(): readonly { readonly categoryId: string; readonly group: string }[] {
  const directory = resolve(settingsModule, "definitions");
  const categoryMap = new Map(
    [...readSource("setting-categories.ts").matchAll(/(\w+):\s*'((?:private|public)\.[A-Za-z0-9_.]+)'/g)].map(
      (match) => [match[1] ?? "", match[2] ?? ""],
    ),
  );
  const pairs: { categoryId: string; group: string }[] = [];
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".ts") && !name.endsWith(".spec.ts"))) {
    const source = readFileSync(resolve(directory, file), "utf8");
    const categoryIds = [...source.matchAll(/categoryId:\s*settingCategoryIds\.(\w+)/g)].map(
      (match) => categoryMap.get(match[1] ?? "") ?? "",
    );
    const groups = [...source.matchAll(/group:\s*'([A-Za-z0-9_.-]+)'/g)].map((match) => match[1] ?? "");
    // Within one file every grouped definition belongs to the same category.
    for (const group of groups) {
      for (const categoryId of new Set(categoryIds)) {
        pairs.push({ categoryId, group });
      }
    }
  }
  return pairs;
}

const declaredGroups = readDefinitionGroups();

/** Category ids declared by the backend, which the tab renders as headings. */
const declaredCategories = [
  ...new Set(
    [...readSource("setting-categories.ts").matchAll(/'((?:private|public)\.[A-Za-z0-9_.]+)'/g)].map(
      (match) => match[1] ?? "",
    ),
  ),
];

function readDictionary(locale: (typeof locales)[number]): Dictionary {
  return (locale === "bs" ? bosnian : english) as unknown as Dictionary;
}

describe("settings registry translations (5.3.4)", () => {
  it("finds the key catalogue it guards", () => {
    // The registry exposes 451 keys; a regression in the reader must fail loudly
    // instead of silently passing because it found nothing to check.
    expect(allKeys).toHaveLength(451);
    expect(allKeys).toContain("private.ticket.sla.enabled");
    expect(allKeys).toContain("private.addons.email");
    // Nine pairs ship today: SMTP, Edge extension and Teams each have three.
    expect(declaredGroups.length).toBeGreaterThanOrEqual(9);
    expect(declaredGroups).toContainEqual({ categoryId: "private.smtp", group: "connection" });
  });

  it.each(locales)("%s describes every setting key", (locale) => {
    const dictionary = readDictionary(locale);
    const missing = allKeys.filter(
      (key) => (dictionary.settings.registry.keys[key] ?? "").trim().length === 0,
    );
    expect(missing).toEqual([]);
  });

  it.each(locales)("%s explains every setting key", (locale) => {
    const dictionary = readDictionary(locale);
    const missing = allKeys.filter(
      (key) => (dictionary.settings.registry.help[key] ?? "").trim().length === 0,
    );
    expect(missing).toEqual([]);
  });

  it.each(locales)("%s keeps titles and help texts free of orphans", (locale) => {
    const dictionary = readDictionary(locale);
    const known = new Set(allKeys);
    const orphans = [
      ...Object.keys(dictionary.settings.registry.keys),
      ...Object.keys(dictionary.settings.registry.help),
    ].filter((key) => !known.has(key));
    expect([...new Set(orphans)]).toEqual([]);
  });

  it.each(locales)("%s keeps titles and explanations a single sentence long", (locale) => {
    const dictionary = readDictionary(locale);
    // Titles are the row headline, help texts the modal body: neither should
    // become an essay, and both should avoid raw key syntax leaking through.
    const tooLong = [...allKeys].filter(
      (key) => (dictionary.settings.registry.keys[key] ?? "").length > 220,
    );
    const essays = allKeys.filter(
      (key) => (dictionary.settings.registry.help[key] ?? "").length > 420,
    );
    expect(tooLong).toEqual([]);
    expect(essays).toEqual([]);
  });

  it.each(locales)("%s titles every declared setting group", (locale) => {
    const dictionary = readDictionary(locale);
    const missing = declaredGroups.filter(
      ({ categoryId, group }) =>
        (dictionary.settings.registry.groups[categoryId]?.[group] ?? "").trim().length === 0,
    );
    expect(missing).toEqual([]);
  });

  it.each(locales)("%s titles every declared setting category", (locale) => {
    const dictionary = readDictionary(locale);
    const titles = dictionary.settings.registry.categories;
    const missing = declaredCategories.filter(
      (categoryId) => (titles[categoryId] ?? "").trim().length === 0,
    );
    expect(missing).toEqual([]);
  });
});
