// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  groupItemsByIntroducingPackage,
  InstallProfilePackageSheet,
} from "@/components/install/install-profile-package-sheet";
import { Sheet } from "@/components/ui/sheet";
import type { InstallProfilePackage } from "@/services/install-profile-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { package?: string }) =>
      options?.package === undefined ? key : `${key}:${options.package}`,
  }),
}));

function pack(
  profile: "minimum" | "standard" | "full",
  items: readonly string[],
): InstallProfilePackage {
  return {
    profile,
    titleKey: `install.profile.${profile}.title`,
    descriptionKey: `install.profile.${profile}.description`,
    estimatedMinutes: 5,
    recommended: false,
    requiredSteps: [],
    offeredSteps: [],
    defaultEnabledAddons: [],
    items: items.map((key) => ({
      key,
      required: true,
      labelKey: `install.profile.item.${key}`,
    })),
  };
}

const packages = [
  pack("minimum", ["tokenGate", "superAdmin"]),
  pack("standard", ["team", "smtp"]),
  pack("full", ["knowledgeBase"]),
];

afterEach(cleanup);

describe("groupItemsByIntroducingPackage", () => {
  it("keeps packages cumulative and groups by the package that introduced each item", () => {
    expect(groupItemsByIntroducingPackage(packages, "full")).toEqual([
      {
        profile: "minimum",
        items: [
          expect.objectContaining({ key: "tokenGate" }),
          expect.objectContaining({ key: "superAdmin" }),
        ],
      },
      {
        profile: "standard",
        items: [expect.objectContaining({ key: "team" }), expect.objectContaining({ key: "smtp" })],
      },
      {
        profile: "full",
        items: [expect.objectContaining({ key: "knowledgeBase" })],
      },
    ]);
  });
});

describe("InstallProfilePackageSheet", () => {
  it("states that Standard includes Minimum and groups the cumulative list", () => {
    render(
      <Sheet open>
        <InstallProfilePackageSheet pack={packages[1]!} packages={packages} />
      </Sheet>,
    );

    expect(screen.getByText("install.profile.includesMinimum")).toBeTruthy();
    expect(
      screen.getByText("install.profile.groupFrom:install.profile.minimum.title"),
    ).toBeTruthy();
    expect(
      screen.getByText("install.profile.groupNewIn:install.profile.standard.title"),
    ).toBeTruthy();
    expect(screen.getByText("install.profile.item.tokenGate")).toBeTruthy();
    expect(screen.getByText("install.profile.item.team")).toBeTruthy();
  });
});
