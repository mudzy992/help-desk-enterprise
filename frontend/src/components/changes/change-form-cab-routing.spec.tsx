// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeFormSheet } from "@/components/changes/change-form-sheet";
import { ToastProvider } from "@/components/ui/toast";
import { createChange, type ChangeOptions } from "@/services/changes-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/changes-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/changes-api")>();
  return { ...actual, createChange: vi.fn(), updateChange: vi.fn() };
});

const create = vi.mocked(createChange);

const capabilities = {
  enabled: true,
  setupRequired: false,
  canRead: true,
  canRequest: true,
  canManage: false,
  canApprove: false,
  cmdbEnabled: false,
  problemsEnabled: false,
  templatesEnabled: false,
  configuration: {
    numberPrefix: "CHG",
    normalQuorum: 1,
    emergencyQuorum: 1,
    minLeadTimeHours: 0,
    requireTestPlan: false,
    freezePeriods: [],
    reminderHoursBeforeStart: 24,
    timeZone: "UTC",
  },
};

function optionsWith(cabGroups: ChangeOptions["cabGroups"]): ChangeOptions {
  return {
    units: [
      { id: "ou-site", name: "Site", path: "/Skupina/Regija/Site" },
      { id: "ou-branch", name: "Regija", path: "/Skupina/Regija" },
    ],
    services: [],
    cabGroups,
    templates: [],
    homeOrganizationalUnitId: "ou-site",
    freezePeriods: [],
    requireTestPlan: false,
    minLeadTimeHours: 0,
  };
}

function renderSheet(options: ChangeOptions) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ChangeFormSheet
          open
          onOpenChange={() => undefined}
          options={options}
          capabilities={capabilities}
          onSaved={() => undefined}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/changes\.fields\.title/), {
    target: { value: "Zamjena preklopnika" },
  });
  fireEvent.change(screen.getByLabelText(/changes\.fields\.description/), {
    target: { value: "Planirani rad" },
  });
}

describe("change form CAB routing (BA-changes-16)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("preselects the only CAB group of the unit and sends it", async () => {
    create.mockResolvedValue({ id: "change-1" } as never);
    renderSheet(
      optionsWith([
        {
          id: "cab-site",
          name: "CAB Site",
          organizationalUnitId: "ou-site",
          organizationalUnitPath: "/Skupina/Regija/Site",
        },
        {
          id: "cab-root",
          name: "CAB Root",
          organizationalUnitId: "ou-root",
          organizationalUnitPath: "/Skupina",
        },
      ]),
    );

    const select = screen.getByLabelText(/changes\.fields\.cabGroup/) as HTMLSelectElement;
    expect(select.value).toBe("cab-site");

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "changes.form.create" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toMatchObject({ cabGroupId: "cab-site" });
  });

  it("does not preselect when the unit owns several groups and blocks the save until one is picked", async () => {
    renderSheet(
      optionsWith([
        {
          id: "cab-standard",
          name: "CAB Standard",
          organizationalUnitId: "ou-site",
          organizationalUnitPath: "/Skupina/Regija/Site",
        },
        {
          id: "cab-security",
          name: "CAB Security",
          organizationalUnitId: "ou-site",
          organizationalUnitPath: "/Skupina/Regija/Site",
        },
      ]),
    );

    const select = screen.getByLabelText(/changes\.fields\.cabGroup/) as HTMLSelectElement;
    // The picker stays visibly empty - it no longer shows an unintended body.
    expect(select.value).toBe("");
    fillRequiredFields();
    const submit = screen.getByRole("button", {
      name: "changes.form.create",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(select, { target: { value: "cab-security" } });
    expect(submit.disabled).toBe(false);
  });

  it("says so when the server had to cut one of its pickers (W7.76)", () => {
    renderSheet({
      ...optionsWith([]),
      truncated: { units: true, services: false, cabGroups: false, templates: false },
    });

    expect(screen.getByTestId("change-form-options-truncated").textContent).toBe(
      "changes.form.optionsTruncated",
    );
  });

  it("stays silent when every picker fitted", () => {
    renderSheet(optionsWith([]));

    expect(screen.queryByTestId("change-form-options-truncated")).toBeNull();
  });

  it("offers every group when the unit chain owns none", async () => {
    renderSheet(
      optionsWith([
        {
          id: "cab-a",
          name: "CAB A",
          organizationalUnitId: "ou-other",
          organizationalUnitPath: "/Drugo",
        },
        {
          id: "cab-b",
          name: "CAB B",
          organizationalUnitId: "ou-other2",
          organizationalUnitPath: "/Drugo/Drugi",
        },
      ]),
    );

    const select = screen.getByLabelText(/changes\.fields\.cabGroup/) as HTMLSelectElement;
    expect(select.value).toBe("");
    const values = [...select.options].map((option) => option.value);
    expect(values).toContain("cab-a");
    expect(values).toContain("cab-b");
  });
});
