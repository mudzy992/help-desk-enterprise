import { describe, expect, it } from "vitest";
import bosnian from "@/i18n/locales/bs/common.json";
import english from "@/i18n/locales/en/common.json";
import { installSectionKeys } from "@/services/install-sections-api";

/*
  F5: the wizard's own prose. Field titles and help texts come from the settings
  registry (guarded by `settings-registry-coverage.spec.ts`), but the step copy —
  heading, the sentence that says what the section gives you, „Šta dobijaš“ and
  the sentences a refusal shows — is written by hand for every section, in both
  languages. A missing one would show a raw key on a screen an operator sees once
  in a lifetime, which is exactly the moment nobody can debug it.
*/

type Dictionary = {
  readonly install: {
    readonly steps: Readonly<Record<string, string>>;
    readonly section: Readonly<Record<string, unknown>> & Readonly<Record<string, string>>;
    readonly security: {
      readonly recommendations: Readonly<Record<string, unknown>> &
        Readonly<Record<string, string>>;
    };
  };
};

const dictionaries: Readonly<Record<"bs" | "en", Dictionary>> = {
  bs: bosnian as unknown as Dictionary,
  en: english as unknown as Dictionary,
};

const sectionSlots = [
  "required",
  "secretHint",
  "secretSet",
  "unset",
  "save",
  "saving",
  "saved",
  "confirmDefaults",
  "errorUnknown",
  "errorKeyNotAllowed",
  "errorDependency",
  "errorRequires",
  "errorValue",
];

const recommendationSlots = ["applied", "pending", "manual", "submit", "saving", "done"];

/** The five recommendations of owner decision 7. */
const recommendationNames = ["mfaAdmins", "mfaOptional", "hibp", "idleTimeout", "captcha"];

function readSlot(source: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

describe("install sections copy (F5)", () => {
  it.each(["bs", "en"] as const)("%s names every section in the rail", (locale) => {
    const dictionary = dictionaries[locale];
    for (const sectionKey of installSectionKeys) {
      expect(
        readSlot(dictionary.install.steps, `section.${sectionKey}`),
        `install.steps.section.${sectionKey}`,
      ).not.toBeNull();
    }
    expect(readSlot(dictionary.install.steps, "securityRecommendations")).not.toBeNull();
  });

  it.each(["bs", "en"] as const)(
    "%s explains every section: title, value and what you get",
    (locale) => {
      const section = dictionaries[locale].install.section;
      for (const sectionKey of installSectionKeys) {
        const block = section[sectionKey] as Readonly<Record<string, unknown>> | undefined;
        expect(block, `install.section.${sectionKey}`).toBeTruthy();
        expect(readSlot(block ?? {}, "title")).not.toBeNull();
        expect(readSlot(block ?? {}, "value")).not.toBeNull();
        const whatYouGet = (block ?? {})["whatYouGet"] as
          Readonly<Record<string, unknown>> | undefined;
        for (const position of ["1", "2", "3"]) {
          expect(
            readSlot(whatYouGet ?? {}, position),
            `${sectionKey}.whatYouGet.${position}`,
          ).not.toBeNull();
        }
      }
    },
  );

  it.each(["bs", "en"] as const)("%s has the shared section sentences", (locale) => {
    const section = dictionaries[locale].install.section;
    for (const slot of sectionSlots) {
      expect(readSlot(section, slot), `install.section.${slot}`).not.toBeNull();
    }
    const requires = section["requires"] as Readonly<Record<string, unknown>>;
    for (const dependency of ["service", "directoryLogin", "team"]) {
      expect(
        readSlot(requires, dependency),
        `install.section.requires.${dependency}`,
      ).not.toBeNull();
    }
  });

  it.each(["bs", "en"] as const)("%s describes the production recommendations", (locale) => {
    const recommendations = dictionaries[locale].install.security.recommendations;
    expect(readSlot(recommendations, "title")).not.toBeNull();
    expect(readSlot(recommendations, "value")).not.toBeNull();
    const whatYouGet = recommendations["whatYouGet"] as Readonly<Record<string, unknown>>;
    for (const position of ["1", "2", "3"]) {
      expect(readSlot(whatYouGet, position)).not.toBeNull();
    }
    for (const slot of recommendationSlots) {
      expect(
        readSlot(recommendations, slot),
        `install.security.recommendations.${slot}`,
      ).not.toBeNull();
    }
    for (const name of recommendationNames) {
      const entry = recommendations[name] as Readonly<Record<string, unknown>>;
      expect(readSlot(entry ?? {}, "title"), `${name}.title`).not.toBeNull();
      expect(readSlot(entry ?? {}, "help"), `${name}.help`).not.toBeNull();
    }
  });

  it("does not leave a section half translated", () => {
    // The two dictionaries are written together; a key that exists in one and not
    // the other is a merge accident, not a fallback.
    const bs = JSON.stringify(dictionaries.bs.install.section);
    const en = JSON.stringify(dictionaries.en.install.section);
    expect(Object.keys(JSON.parse(bs) as object).sort()).toEqual(
      Object.keys(JSON.parse(en) as object).sort(),
    );
  });
});
