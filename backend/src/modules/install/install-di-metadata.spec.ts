import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OPTIONAL_DEPS_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from "@nestjs/common/constants";
import { AccountSecurityPolicyLoader } from "../authentication/security/account-security-policy.loader";
import { SmtpMailTransport } from "../notifications/email/smtp-mail-transport";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { InstallAddonsService } from "./install-addons.service";
import { InstallBlueprintController } from "./install-blueprint.controller";
import { InstallBlueprintService } from "./blueprints/install-blueprint.service";
import { InstallContentController } from "./install-content.controller";
import { InstallSectionsController } from "./install-sections.controller";
import { InstallController } from "./install.controller";
import { InstallPolicyPackService } from "./install-policy-pack.service";
import { InstallSlaReviewService } from "./install-sla-review.service";
import { InstallSmtpTestController } from "./install-smtp-test.controller";
import { InstallSmtpTestService } from "./install-smtp-test.service";
import { InstallStepsController } from "./install-steps.controller";
import { InstallCompleteService } from "./install-complete.service";
import { InstallIdentityService } from "./install-identity.service";
import { InstallLoginProviderService } from "./install-login-provider.service";
import { InstallProfileService } from "./install-profile.service";
import { InstallReadinessService } from "./install-readiness.service";
import { InstallSeedService } from "./install-seed.service";
import { InstallSetupGuard } from "./install-setup.guard";
import { InstallSetupService } from "./install-setup.service";
import { InstallSmtpService } from "./install-smtp.service";
import { InstallStepSkipService } from "./install-step-skip.service";
import { InstallSuperAdminService } from "./install-super-admin.service";
import { InstallTeamService } from "./install-team.service";
import { InstallWizardLockGuard } from "./install-wizard-lock.guard";
import { InstallSecurityRecommendationsService } from "./sections/install-security-recommendations.service";
import { InstallSettingsSectionService } from "./sections/install-settings-section.service";

/*
  Review finding (CI on PR #10): `InstallSetupService` was imported as
  `import type { PrismaService }`, and `emitDecoratorMetadata` then emits
  `Function` instead of the class — Nest answers "argument Function at index [1]"
  while `app.module.spec.ts` compiles the real AppModule. Local unit tests never
  notice, because they build the service by hand.

  The rule that catches the whole family: a class Nest must resolve by type has to
  arrive as the class itself. An interface (or a union) emits `Object`, which only
  works together with `@Inject(...)` or `@Optional()`.
*/

const providers: Readonly<Record<string, object>> = {
  InstallSetupService,
  InstallSuperAdminService,
  InstallIdentityService,
  InstallTeamService,
  InstallLoginProviderService,
  InstallSmtpService,
  InstallSeedService,
  InstallAddonsService,
  InstallProfileService,
  InstallStepSkipService,
  InstallReadinessService,
  InstallCompleteService,
  InstallBlueprintService,
  InstallPolicyPackService,
  InstallSlaReviewService,
  InstallSmtpTestService,
  InstallSettingsSectionService,
  InstallSecurityRecommendationsService,
  InstallSetupGuard,
  InstallWizardLockGuard,
  AccountSecurityPolicyLoader,
  SmtpMailTransport,
  PrismaService,
  SettingsService,
};

/**
 * Providers `install.module.ts` builds with `useFactory` — Nest calls the factory
 * and never reads their constructor metadata, so they are checked by the factory
 * signature instead (which is why `InstallAddonsService` may keep type-only
 * imports of its collaborators).
 */
const factoryBuiltProviders: readonly string[] = ["InstallAddonsService"];

/** Controllers are instantiated by the injector as well, so they obey both rules. */
const controllers: Readonly<Record<string, object>> = {
  InstallBlueprintController,
  InstallContentController,
  InstallSectionsController,
  InstallSmtpTestController,
  InstallController,
  InstallStepsController,
};

/** Identifiers `install.module.ts` lists in one of its arrays (CAPS tokens are not classes). */
function listModuleIdentifiers(
  section: "providers" | "controllers",
): readonly string[] {
  const source = readFileSync(join(__dirname, "install.module.ts"), "utf8")
    // Comments inside the arrays name releases ("Paket 5.1 (M1 #1): …"), not classes.
    .replace(/\/\/.*$/gm, "");
  const start = source.indexOf(`${section}: [`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  let end = start;
  for (
    let index = source.indexOf("[", start);
    index < source.length;
    index += 1
  ) {
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  const found = new Set<string>();
  for (const match of source
    .slice(start, end)
    .matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)) {
    const identifier = match[1];
    if (/^[A-Z0-9_]+$/.test(identifier)) continue;
    found.add(identifier);
  }
  return [...found];
}

/** Everything the injector instantiates itself, so its metadata has to be right. */
function injectorBound(): readonly (readonly [string, object])[] {
  return [
    ...Object.entries(providers).filter(
      ([name]) => !factoryBuiltProviders.includes(name),
    ),
    ...Object.entries(controllers),
  ];
}

function declaredTypes(provider: object): readonly unknown[] {
  return (
    (Reflect.getMetadata(
      "design:paramtypes",
      provider,
    ) as readonly unknown[]) ?? []
  );
}

function injectedIndexes(provider: object): readonly number[] {
  const tokens =
    (Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, provider) as
      readonly { readonly index: number }[] | undefined) ?? [];
  return tokens.map((token) => token.index);
}

function optionalIndexes(provider: object): readonly number[] {
  return (
    (Reflect.getMetadata(
      OPTIONAL_DEPS_METADATA,
      provider,
    ) as readonly number[]) ?? []
  );
}

describe("install module dependency injection metadata", () => {
  it("declares every provider and controller of install.module.ts here", () => {
    // Stops the guard from silently missing a provider added later.
    for (const identifier of listModuleIdentifiers("providers")) {
      expect(Object.keys(providers)).toContain(identifier);
    }
    for (const identifier of listModuleIdentifiers("controllers")) {
      expect(Object.keys(controllers)).toContain(identifier);
    }
  });

  it("never emits Function for a constructor parameter", () => {
    // `Function` means a class was imported as a type: the container then looks
    // for a provider literally called `Function` and the whole app stops booting.
    for (const [name, provider] of injectorBound()) {
      const offenders = declaredTypes(provider)
        .map((type, index) => ({ index, type }))
        .filter(({ type }) => type === Function);
      expect({ name, offenders }).toEqual({ name, offenders: [] });
    }
  });

  it("resolves a declared Object parameter through @Inject or @Optional", () => {
    for (const [name, provider] of injectorBound()) {
      const injected = [...injectedIndexes(provider), ...optionalIndexes(provider)];
      const offenders = declaredTypes(provider)
        .map((type, index) => ({ index, type }))
        .filter(({ index, type }) => type === Object && !injected.includes(index))
        .map(({ index }) => index);
      expect({ name, offenders }).toEqual({ name, offenders: [] });
    }
  });
});
