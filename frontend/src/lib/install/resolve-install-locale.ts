/**
 * Install wizard v2 the interface decides which locale the wizard writes
 * names in. Blueprint names are stored as value pairs per locale, so the wizard
 * passes the locale it is reading instead of guessing from the seeded data.
 * Anything that is not English is Bosnian — the same default the app ships.
 */
export type InstallLocale = "bs" | "en";

export function resolveInstallLocale(language: string | undefined): InstallLocale {
  return language?.toLowerCase().startsWith("en") === true ? "en" : "bs";
}
