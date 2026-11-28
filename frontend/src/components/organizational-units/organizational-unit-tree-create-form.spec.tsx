// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationalUnitTreeCreateForm } from "@/components/organizational-units/organizational-unit-tree-create-form";
import { ApiError } from "@/services/api";
import { createOrganizationalUnitFromTree } from "@/services/directory-sync-api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "bs" },
    t: (key: string, options?: Record<string, unknown>) =>
      options?.path === undefined ? key : `${key}:${String(options.path)}`,
  }),
}));

vi.mock("@/services/directory-sync-api", () => ({
  createOrganizationalUnitFromTree: vi.fn(),
}));

const tree: readonly OrganizationalUnitTreeNode[] = [
  {
    id: "ou-korisnici",
    name: "Korisnici",
    ouPath: "/Korisnici",
    distinguishedName: "OU=Korisnici,DC=local",
    type: "DIRECTORATE",
    parentId: null,
    children: [
      {
        id: "ou-direkcija",
        name: "Direkcija",
        ouPath: "/Korisnici/Direkcija",
        distinguishedName: "OU=Direkcija,OU=Korisnici,DC=local",
        type: "BRANCH",
        parentId: "ou-korisnici",
        children: [],
      },
    ],
  },
];

function renderForm(overrides?: { readonly onCreated?: (value: unknown) => Promise<void> }) {
  const onCreated = overrides?.onCreated ?? vi.fn(async () => {});
  render(
    <OrganizationalUnitTreeCreateForm
      tree={tree}
      onCancel={() => {}}
      onCreated={onCreated as never}
    />,
  );
  return { onCreated };
}

describe("OrganizationalUnitTreeCreateForm (W2.36c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("offers the real tree as the parent list, never catalogue rows", () => {
    renderForm();

    const parent = screen.getByLabelText("directory.ouParentTreePlaceholder") as HTMLSelectElement;
    const labels = [...parent.options].map((option) => option.textContent);
    expect(labels).toContain("/Korisnici");
    // Nested options are indented, so the path is a suffix rather than the label.
    expect(labels.some((label) => label?.endsWith("/Korisnici/Direkcija"))).toBe(true);
    expect(labels).toContain("directory.ouParentRootOption");
  });

  it("shows the DN the server will write, derived from the chosen parent", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("directory.ouNamePlaceholder"), {
      target: { value: "  Prodaja  " },
    });
    expect(screen.getByTestId("ou-dn-preview").textContent).toBe(
      "OU=Prodaja,OU=Korisnici,DC=local",
    );

    fireEvent.change(screen.getByLabelText("directory.ouParentTreePlaceholder"), {
      target: { value: "" },
    });
    expect(screen.getByTestId("ou-dn-preview").textContent).toBe("OU=Prodaja,DC=local");
  });

  it("refuses a name a DN cannot carry and keeps the save closed", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("directory.ouNamePlaceholder"), {
      target: { value: "Prodaja,DC=evil" },
    });

    expect(screen.getByText("directory.ouNameProblem.forbidden_character")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "directory.ouSave" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("refuses a name that already exists on that path", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("directory.ouNamePlaceholder"), {
      target: { value: "Direkcija" },
    });

    expect(screen.getByText("directory.ouNameProblem.duplicate_path")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "directory.ouSave" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("posts only the name, the tree parent and the type", async () => {
    const created = {
      organizationalUnit: {
        id: "ou-nova",
        name: "Prodaja",
        type: "BRANCH",
        distinguishedName: "OU=Prodaja,OU=Korisnici,DC=local",
        ouPath: "/Korisnici/Prodaja",
        parentId: "ou-korisnici",
      },
      catalogEntry: {
        id: "catalog-1",
        externalId: "manual_only:ou:x",
        displayName: "Prodaja",
        distinguishedName: "OU=Prodaja,OU=Korisnici,DC=local",
        organizationalUnitPath: "/Korisnici/Prodaja",
        parentExternalId: "manual_only:ou:y",
        type: "BRANCH",
      },
    };
    vi.mocked(createOrganizationalUnitFromTree).mockResolvedValue(created);
    const { onCreated } = renderForm();

    fireEvent.change(screen.getByLabelText("directory.ouNamePlaceholder"), {
      target: { value: "Prodaja" },
    });
    fireEvent.click(screen.getByRole("button", { name: "directory.ouSave" }));

    await waitFor(() =>
      expect(createOrganizationalUnitFromTree).toHaveBeenCalledWith({
        displayName: "Prodaja",
        parentOrganizationalUnitId: "ou-korisnici",
        type: "BRANCH",
      }),
    );
    // No `distinguishedName` and no `parentExternalId`: the client cannot mis-fill.
    const [payload] = vi.mocked(createOrganizationalUnitFromTree).mock.calls[0]!;
    expect(Object.keys(payload).sort()).toEqual([
      "displayName",
      "parentOrganizationalUnitId",
      "type",
    ]);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it("reports a server-side duplicate with the path it collided with", async () => {
    vi.mocked(createOrganizationalUnitFromTree).mockRejectedValue(
      new ApiError(409, "DUPLICATE_PATH", "exists", null, {
        organizationalUnitPath: "/Korisnici/Prodaja",
      }),
    );
    renderForm();

    fireEvent.change(screen.getByLabelText("directory.ouNamePlaceholder"), {
      target: { value: "Prodaja" },
    });
    fireEvent.click(screen.getByRole("button", { name: "directory.ouSave" }));

    expect(await screen.findByText("directory.ouCreateDuplicate:/Korisnici/Prodaja")).toBeTruthy();
  });

  it("names the namespace problem instead of failing silently", async () => {
    vi.mocked(createOrganizationalUnitFromTree).mockRejectedValue(
      new ApiError(400, "DIRECTORY_NAMESPACE_UNKNOWN", "unknown", null),
    );
    renderForm();

    fireEvent.change(screen.getByLabelText("directory.ouNamePlaceholder"), {
      target: { value: "Prodaja" },
    });
    fireEvent.click(screen.getByRole("button", { name: "directory.ouSave" }));

    expect(await screen.findByText("directory.ouCreateNamespaceUnknown")).toBeTruthy();
  });
});
