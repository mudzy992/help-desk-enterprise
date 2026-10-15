// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallBlueprintStep } from "@/components/install/install-blueprint-step";
import { ApiError } from "@/services/api";
import {
  applyInstallBlueprint,
  loadInstallBlueprints,
  type InstallBlueprintCatalog,
} from "@/services/install-content-api";

// Radix `Switch` in jsdom.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/install-content-api", () => ({
  loadInstallBlueprints: vi.fn(),
  applyInstallBlueprint: vi.fn(),
}));

/*
  F4.2: the operator sees the tree the wizard will create and can leave a request
  type out. The spec checks exactly that: what the payload contains, and that a
  failed apply says the same thing the readiness check says — nothing was written.
*/
const catalog: InstallBlueprintCatalog = {
  locale: "bs",
  applied: null,
  blueprints: [
    {
      key: "itServiceDesk",
      names: { bs: "IT service desk", en: "IT service desk" },
      slaProfileKey: "STANDARD_REQUEST",
      policyPackKeys: ["PACK_IT_STANDARD"],
      tierGroups: [],
      categories: [
        {
          key: "hardware",
          names: { bs: "Hardver", en: "Hardware" },
          slug: "hardver",
          services: [
            {
              key: "computerEquipment",
              names: { bs: "Računar i oprema", en: "Computer and equipment" },
              slug: "racunar-i-oprema",
            },
            {
              key: "printersPeripherals",
              names: { bs: "Štampači i periferije", en: "Printers and peripherals" },
              slug: "stampaci-i-periferije",
            },
          ],
        },
      ],
    },
  ],
};

const appliedResult = {
  blueprintKey: "itServiceDesk",
  locale: "bs" as const,
  createdCategoryCount: 1,
  createdServiceCount: 2,
  existingServiceCount: 0,
  createdTierGroupCount: 0,
  tierGroupKeys: [],
  services: [],
};

describe("InstallBlueprintStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallBlueprints).mockReset();
    vi.mocked(applyInstallBlueprint).mockReset();
  });

  it("shows the tree in the language the operator is reading", async () => {
    vi.mocked(loadInstallBlueprints).mockResolvedValue(catalog);

    render(<InstallBlueprintStep />);

    expect(await screen.findByText("Hardver")).toBeTruthy();
    expect(screen.getByText("Računar i oprema")).toBeTruthy();
    expect(screen.getByText("Štampači i periferije")).toBeTruthy();
  });

  it("applies every request type of the template by default", async () => {
    vi.mocked(loadInstallBlueprints).mockResolvedValue(catalog);
    vi.mocked(applyInstallBlueprint).mockResolvedValue(appliedResult);
    const onSaved = vi.fn();

    render(<InstallBlueprintStep onSaved={onSaved} />);

    fireEvent.click(await screen.findByText("install.blueprint.submit"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(applyInstallBlueprint).toHaveBeenCalledWith({
      blueprintKey: "itServiceDesk",
      includeServices: ["computerEquipment", "printersPeripherals"],
      createTierGroups: false,
      locale: "bs",
    });
    expect(await screen.findByText("install.blueprint.applied")).toBeTruthy();
  });

  it("leaves out what the operator switched off", async () => {
    vi.mocked(loadInstallBlueprints).mockResolvedValue(catalog);
    vi.mocked(applyInstallBlueprint).mockResolvedValue({
      ...appliedResult,
      createdServiceCount: 1,
    });

    render(<InstallBlueprintStep />);

    // Both request types share the label key; the mock's `t` ignores the service.
    const switches = await screen.findAllByLabelText("install.blueprint.toggleService");
    fireEvent.click(switches[0]!);
    fireEvent.click(screen.getByText("install.blueprint.submit"));

    await waitFor(() =>
      expect(applyInstallBlueprint).toHaveBeenCalledWith(
        expect.objectContaining({ includeServices: ["printersPeripherals"] }),
      ),
    );
  });

  it("shows the load error instead of an empty tree", async () => {
    vi.mocked(loadInstallBlueprints).mockRejectedValue(new ApiError(500, "INTERNAL", "boom"));

    render(<InstallBlueprintStep />);

    expect(await screen.findByText("install.stepLoadError")).toBeTruthy();
    fireEvent.click(screen.getByText("install.retry"));
    await waitFor(() => expect(loadInstallBlueprints).toHaveBeenCalledTimes(2));
  });
});
