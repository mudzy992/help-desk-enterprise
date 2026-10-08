import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { permissionCatalogEntries, permissionCategoryIds } from './permission-catalog';

/**
 * Paket 5.3.2 (§4.4): every permission the code knows about must have a BS and
 * an EN title in the frontend dictionaries. Without this guard a new permission
 * silently renders its English backend description inside the Bosnian UI — the
 * screen that failed this rule had been shipping five such keys.
 *
 * The guard reads the dictionaries from disk (they are the single source of the
 * translations) and fails the backend job, which is the job that runs it.
 */
type Dictionary = {
  readonly permissions: {
    readonly catalog: {
      readonly categories: Readonly<Record<string, string>>;
      readonly keys: Readonly<Record<string, string>>;
    };
  };
  readonly policyPacks: { readonly permissions: Readonly<Record<string, string>> };
};

const locales = ['bs', 'en'] as const;

function readDictionary(locale: (typeof locales)[number]): Dictionary {
  const path = resolve(
    __dirname,
    `../../../../frontend/src/i18n/locales/${locale}/common.json`,
  );
  return JSON.parse(readFileSync(path, 'utf8')) as Dictionary;
}

function isTranslated(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

describe('permission catalog translations (5.3.2)', () => {
  it.each(locales)('%s covers every permission key with a title', (locale) => {
    const dictionary = readDictionary(locale);
    const missing = permissionCatalogEntries
      .map((entry) => entry.key)
      .filter((key) => !isTranslated(dictionary.permissions.catalog.keys[key]));
    expect(missing).toEqual([]);
  });

  it.each(locales)('%s covers every permission category', (locale) => {
    const dictionary = readDictionary(locale);
    const categories = [
      ...new Set(permissionCatalogEntries.map((entry) => entry.categoryId)),
    ];
    const missing = categories.filter(
      (categoryId) =>
        !isTranslated(dictionary.permissions.catalog.categories[categoryId]),
    );
    expect(missing).toEqual([]);
  });

  it.each(locales)('%s has no orphan permission titles', (locale) => {
    const dictionary = readDictionary(locale);
    const known = new Set(permissionCatalogEntries.map((entry) => entry.key));
    const orphans = Object.keys(dictionary.permissions.catalog.keys).filter(
      (key) => !known.has(key),
    );
    expect(orphans).toEqual([]);
  });

  it('keeps the catalog aligned with the category ids', () => {
    const known = new Set<string>(Object.values(permissionCategoryIds));
    const unknown = permissionCatalogEntries
      .map((entry) => entry.categoryId)
      .filter((categoryId) => !known.has(categoryId));
    expect(unknown).toEqual([]);
  });
});
