import { describe, expect, it } from "vitest";
import bosnian from "@/i18n/locales/bs/common.json";
import english from "@/i18n/locales/en/common.json";

/**
 * F6 — the copy the install-wizard E2E drives.
 *
 * `e2e/tests/51-install-wizard-minimum.spec.ts` and `52-…standard…` walk the
 * wizard by the operator's own labels: every screen is recognised by its `h1`
 * and every action is a button with a name. Those patterns live in
 * `e2e/install-wizard/{install-wizard-actions,install-wizard-step-reader,install-wizard-submit}.ts`
 * and are duplicated here on purpose: the two statements must agree.
 *
 * The failure this guards against already happened once — the SuperAdmin submit
 * button says „Dalje“ while the pattern only knew „Nastavi“/„Continue“, and the
 * run burned its whole timeout on a button that was on screen the entire time.
 * Renaming any of these strings now fails the frontend job instead of the
 * browser run.
 */
type Dictionary = Record<string, unknown>;

function value(dictionary: Dictionary, key: string): string {
  const found = key.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Dictionary)[part];
  }, dictionary);
  expect(typeof found, `${key} is a string in the dictionary`).toBe("string");
  return found as string;
}

/** `[key, the pattern the E2E accepts]` — both locales have to satisfy it. */
const labels: ReadonlyArray<readonly [string, RegExp]> = [
  // Headlines: `install-wizard-step-reader.ts` recognises every screen by its h1.
  ["install.profile.heading", /paket instalacije|installation package/i],
  ["install.heading", /superadmin nalog|superadmin account/i],
  ["install.identity.heading", /identitet instalacije|installation identity/i],
  ["install.loginProvider.heading", /način prijave|sign-in method/i],
  ["install.smtp.heading", /^smtp$/i],
  ["install.structure.heading", /struktura i prvi servis|structure and the first service/i],
  ["install.team.heading", /^tim$|^team$/i],
  ["install.blueprint.heading", /katalog iz predloška|catalog from a template/i],
  ["install.policyPack.heading", /paket prava|policy pack|permission pack/i],
  [
    "install.slaReview.heading",
    /radno vrijeme i prioriteti|working hours and priorities|business hours and priorities/i,
  ],
  ["install.addons.heading", /dodaci|add-ons/i],
  ["install.provisioning.heading", /provjera spremnosti|readiness checks/i],
  ["install.complete.heading", /sistem je spreman|the system is ready/i],
  ["install.security.recommendations.title", /preporuke za produkciju|production recommendations/i],
  // Actions: `install-wizard-submit.ts` accepts the step's own „save and move on“.
  ["install.submit", /dalje|nastavi|continue|next/i],
  ["install.identity.submit", /sačuvaj|save/i],
  ["install.structure.submit", /kreiraj|create/i],
  ["install.team.submit", /kreiraj naloge|create the accounts/i],
  ["install.blueprint.submit", /primijeni predložak|apply (the )?template/i],
  ["install.policyPack.submit", /primijeni paket|apply (the )?pack/i],
  ["install.slaReview.confirm", /potvrđujem podrazumijevano|i confirm the defaults/i],
  [
    "install.security.recommendations.submit",
    /primijeni preporuke|apply (the )?(production )?recommendations/i,
  ],
  ["install.addons.submit", /dalje|continue|next/i],
  ["install.provisioning.finish", /završi instalaciju|finish (the )?installation/i],
  ["install.provisioning.recheck", /provjeri ponovo|check again/i],
  ["install.ready.signIn", /prijavite se|sign in/i],
  ["install.step.skip", /podesi kasnije|configure later/i],
  ["install.profile.select", /izaberi|choose|select/i],
  ["install.profile.submit", /nastavi s paketom|continue with this package/i],
  // Fields: the specs type into the step forms by the label the operator reads
  // (`getByLabel`). The team rows number their labels („Email 1“, „E-mail 1“), so
  // the two patterns for them stay unanchored.
  ["install.email", /^email$/i],
  ["install.displayName", /ime i prezime|full name|display name/i],
  ["install.password", /^lozinka$|^password$/i],
  ["install.confirmPassword", /potvrda lozinke|confirm password/i],
  ["install.identity.organizationName", /naziv organizacije|organi[sz]ation name/i],
  ["install.identity.timeZone", /vremenska zona|time zone/i],
  ["install.structure.ouName", /organizacijska jedinica|organisational unit/i],
  ["install.structure.groupName", /grupa koja prima tikete|group that receives tickets/i],
  ["install.structure.serviceName", /^servis$|^service$/i],
  ["install.team.displayName", /ime i prezime|full name|display name/i],
  ["install.team.email", /e-?mail/i],
  ["install.smtp.host", /smtp host/i],
  ["install.smtp.port", /smtp port/i],
  ["install.smtp.username", /smtp korisnik|smtp username/i],
  ["install.smtp.password", /smtp lozinka|smtp password/i],
  ["install.smtp.fromAddress", /from adresa|from address/i],
];

describe("install wizard E2E copy", () => {
  for (const [locale, dictionary] of [
    ["bs", bosnian as Dictionary],
    ["en", english as Dictionary],
  ] as const) {
    for (const [key, pattern] of labels) {
      it(`${locale}: ${key}`, () => {
        expect(pattern.test(value(dictionary, key))).toBe(true);
      });
    }
  }
});
