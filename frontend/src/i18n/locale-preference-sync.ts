import { isLocale, type Locale } from "@/i18n/locale";

export type LocaleSyncDecision =
  | { readonly action: "none" }
  | { readonly action: "push"; readonly locale: Locale }
  | { readonly action: "apply"; readonly locale: Locale };

/**
 * Paket 1.5: e-mails are sent in the user's saved language, so the UI and the
 * server must agree. At sign-in the saved choice follows the user to any
 * device; a user who never chose one gets the language they are using now.
 */
export function decideLocaleSync(input: {
  readonly serverLocale: string | null;
  readonly currentLocale: Locale;
}): LocaleSyncDecision {
  if (!isLocale(input.serverLocale)) {
    return { action: "push", locale: input.currentLocale };
  }
  if (input.serverLocale !== input.currentLocale) {
    return { action: "apply", locale: input.serverLocale };
  }
  return { action: "none" };
}
