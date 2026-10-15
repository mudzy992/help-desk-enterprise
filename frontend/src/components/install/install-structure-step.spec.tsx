// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallStructureStep } from "@/components/install/install-structure-step";
import { loadInstallSeed, runInstallSeed } from "@/services/install-seed-api";

vi.mock("react-i18next", () => ({
  // The warning is the only interpolated string in this step; the stub appends
  // the values it was handed so the assertion can read what the operator sees.
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.stored === undefined ? key : `${key}:${String(options.stored)}`,
  }),
  // The preview is the only `Trans` in the wizard; the stub prints the values
  // it was handed so the assertion can read the sentence the operator sees.
  Trans: ({ i18nKey, values }: { i18nKey: string; values?: Record<string, unknown> }) => (
    <span>{`${i18nKey}:${String(values?.service)}|${String(values?.group)}|${String(values?.organizationalUnit)}`}</span>
  ),
}));

vi.mock("@/services/install-seed-api", () => ({
  loadInstallSeed: vi.fn(),
  runInstallSeed: vi.fn(),
}));

const emptySeed = {
  isSeeded: false,
  categoryName: null,
  organizationalUnit: null,
  fallbackGroup: null,
  service: null,
  routingRule: null,
  resolution: null,
};

const seededRecords = {
  isSeeded: true,
  categoryName: "Opće usluge",
  organizationalUnit: {
    id: "ou-1",
    name: "Gradska uprava Visoko",
    ouPath: "OU=Gradska uprava Visoko,DC=local",
  },
  fallbackGroup: {
    id: "group-1",
    name: "Podrška",
    key: "podrska",
    isFallback: true,
    organizationalUnitId: "ou-1",
  },
  service: {
    id: "service-1",
    name: "Zahtjev za pomoć",
    slug: "zahtjev-za-pomoc",
    lifecycle: "ACTIVE",
    slaProfileKey: "STANDARD_REQUEST",
  },
  routingRule: { id: "rule-1", originUnitId: "ou-1", serviceId: "service-1", groupId: "group-1" },
  resolution: { outcome: "EXACT", groupId: "group-1", fallbackDepth: 0 },
};

/**
 * F2: the seed is parametrized — the operator types the client's names and sees
 * what the routing will do with them before anything is created.
 */
describe("InstallStructureStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallSeed).mockReset();
    vi.mocked(runInstallSeed).mockReset();
  });

  it("previews the sentence the routing produces while the names are typed", async () => {
    vi.mocked(loadInstallSeed).mockResolvedValue({ seed: emptySeed });

    render(<InstallStructureStep />);
    fireEvent.change(await screen.findByLabelText("install.structure.ouName"), {
      target: { value: "Gradska uprava Visoko" },
    });
    fireEvent.change(screen.getByLabelText("install.structure.groupName"), {
      target: { value: "Podrška" },
    });
    fireEvent.change(screen.getByLabelText("install.structure.serviceName"), {
      target: { value: "Zahtjev za pomoć" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("install-structure-preview").textContent).toBe(
        "install.structure.preview:Zahtjev za pomoć|Podrška|Gradska uprava Visoko",
      ),
    );
  });

  it("posts the names the operator typed", async () => {
    vi.mocked(loadInstallSeed).mockResolvedValue({ seed: emptySeed });
    vi.mocked(runInstallSeed).mockResolvedValue(seededRecords);
    const onSaved = vi.fn();

    render(<InstallStructureStep onSaved={onSaved} />);
    fireEvent.change(await screen.findByLabelText("install.structure.ouName"), {
      target: { value: "Gradska uprava Visoko" },
    });
    fireEvent.change(screen.getByLabelText("install.structure.groupName"), {
      target: { value: "Podrška" },
    });
    fireEvent.change(screen.getByLabelText("install.structure.categoryName"), {
      target: { value: "Opće usluge" },
    });
    fireEvent.change(screen.getByLabelText("install.structure.serviceName"), {
      target: { value: "Zahtjev za pomoć" },
    });
    fireEvent.click(screen.getByRole("button", { name: "install.structure.submit" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(runInstallSeed).toHaveBeenCalledWith({
      organizationalUnitName: "Gradska uprava Visoko",
      handlerGroupName: "Podrška",
      categoryName: "Opće usluge",
      serviceName: "Zahtjev za pomoć",
    });
  });

  it("tells the operator which names the installation kept", async () => {
    vi.mocked(loadInstallSeed).mockResolvedValue({ seed: emptySeed });
    vi.mocked(runInstallSeed).mockResolvedValue({
      ...seededRecords,
      warning: {
        code: "NAMES_ALREADY_SEEDED",
        requested: {
          organizationalUnitName: "Drugo ime",
          handlerGroupName: "Druga grupa",
          categoryName: "Opšte",
          serviceName: "Drugi servis",
        },
        stored: {
          organizationalUnitName: "Gradska uprava Visoko",
          handlerGroupName: "Podrška",
          categoryName: "Opće usluge",
          serviceName: "Zahtjev za pomoć",
        },
      },
    });

    render(<InstallStructureStep />);
    fireEvent.change(await screen.findByLabelText("install.structure.ouName"), {
      target: { value: "Drugo ime" },
    });
    fireEvent.change(screen.getByLabelText("install.structure.groupName"), {
      target: { value: "Druga grupa" },
    });
    fireEvent.change(screen.getByLabelText("install.structure.serviceName"), {
      target: { value: "Drugi servis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "install.structure.submit" }));

    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("install.structure.warningNames");
    expect(notice.textContent).toContain("Gradska uprava Visoko");
    expect(notice.textContent).toContain("Podrška");
    expect(notice.textContent).toContain("Zahtjev za pomoć");
  });

  it("reports the stored structure including the SLA profile", async () => {
    vi.mocked(loadInstallSeed).mockResolvedValue({ seed: seededRecords });

    render(<InstallStructureStep />);

    expect(await screen.findByText(/Gradska uprava Visoko/)).toBeTruthy();
    expect(screen.getByText("Podrška")).toBeTruthy();
    expect(screen.getByText(/Zahtjev za pomoć/)).toBeTruthy();
    expect(screen.getByText("STANDARD_REQUEST")).toBeTruthy();
    // An already seeded structure is reported, never offered for a second seed.
    expect(screen.queryByRole("button", { name: "install.structure.submit" })).toBeNull();
  });

  it("keeps the form closed when the stored structure cannot be read", async () => {
    vi.mocked(loadInstallSeed).mockRejectedValue(new Error("down"));

    render(<InstallStructureStep />);

    expect((await screen.findByRole("alert")).textContent).toContain("install.stepLoadError");
    expect(screen.queryByRole("button", { name: "install.structure.submit" })).toBeNull();
  });
});
