// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceFormBuilder } from "@/components/services/form-builder/service-form-builder";
import { ensureServiceForm } from "@/lib/services/ensure-service-form";
import {
  activateServiceFormVersion,
  getServiceForm,
  type ServiceFormResponse,
} from "@/services/service-catalog-api";
import { updateServiceFormVersion } from "@/services/service-forms-api";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/services/ensure-service-form", () => ({ ensureServiceForm: vi.fn() }));
vi.mock("@/services/service-catalog-api", async (original) => ({
  ...(await original<typeof import("@/services/service-catalog-api")>()),
  getServiceForm: vi.fn(),
  activateServiceFormVersion: vi.fn(),
}));
vi.mock("@/services/service-forms-api", () => ({
  updateServiceFormVersion: vi.fn(),
  createServiceFormVersion: vi.fn(),
}));
vi.mock("@/components/services/form-builder/form-version-history", () => ({
  FormVersionHistory: () => null,
}));
vi.mock("@/components/services/form-builder/form-field-list", () => ({
  FormFieldList: ({ fields }: { fields: readonly { id: string }[] }) => (
    <div data-testid="field-ids">{fields.map((field) => field.id).join(",")}</div>
  ),
}));
vi.mock("@/components/services/form-builder/form-builder-actions", () => ({
  FormBuilderActions: ({ onSave, onActivate }: { onSave: () => void; onActivate: () => void }) => (
    <>
      <button onClick={onSave}>save</button>
      <button onClick={onActivate}>activate</button>
    </>
  ),
}));

const ensure = vi.mocked(ensureServiceForm);
const getForm = vi.mocked(getServiceForm);
const saveVersion = vi.mocked(updateServiceFormVersion);
const activateVersion = vi.mocked(activateServiceFormVersion);

function form(serviceId: string, activeFormVersionRef: string | null, fieldId = "field-1") {
  return {
    serviceId,
    formsEnabled: true,
    requireVersionOnTicket: false,
    activeFormVersionRef,
    versions: [
      {
        formVersionRef: `${serviceId}-draft`,
        serviceId,
        version: 1,
        status: "DRAFT",
        schema: {
          schemaVersion: 1,
          fields: [{ id: fieldId, label: "Field", type: "text", required: false, order: 0 }],
        },
      },
    ],
  } satisfies ServiceFormResponse;
}

describe("ServiceFormBuilder request lifecycle", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("ensures once, ignores parent rerenders, and refreshes catalog only on active change", async () => {
    const initial = form("service-1", null);
    ensure.mockResolvedValue(initial);
    saveVersion.mockResolvedValue(initial.versions[0]);
    activateVersion.mockResolvedValue(initial.versions[0]);
    getForm
      .mockResolvedValueOnce(form("service-1", null))
      .mockResolvedValueOnce(form("service-1", "service-1-draft"));
    const onActiveVersion = vi.fn();
    const view = render(
      <ServiceFormBuilder serviceId="service-1" canWrite onActiveVersion={onActiveVersion} />,
    );
    await waitFor(() => expect(ensure).toHaveBeenCalledOnce());

    view.rerender(
      <ServiceFormBuilder serviceId="service-1" canWrite onActiveVersion={onActiveVersion} />,
    );
    expect(ensure).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(getForm).toHaveBeenCalledTimes(1));
    expect(onActiveVersion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("activate"));
    await waitFor(() => expect(getForm).toHaveBeenCalledTimes(2));
    expect(onActiveVersion).toHaveBeenCalledWith("service-1-draft");
  });

  it("ignores a stale ensure result after switching services", async () => {
    let resolveOld!: (value: ServiceFormResponse) => void;
    ensure
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce(form("service-2", null, "new-field"));
    const view = render(
      <ServiceFormBuilder serviceId="service-1" canWrite onActiveVersion={vi.fn()} />,
    );
    view.rerender(<ServiceFormBuilder serviceId="service-2" canWrite onActiveVersion={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("field-ids").textContent).toBe("new-field"));
    await act(async () => resolveOld(form("service-1", null, "old-field")));
    expect(screen.getByTestId("field-ids").textContent).toBe("new-field");
  });
});
