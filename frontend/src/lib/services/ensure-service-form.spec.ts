import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultServiceFormSchema } from "@/lib/services/default-service-form-schema";
import { ensureServiceForm } from "@/lib/services/ensure-service-form";
import {
  createServiceForm,
  getServiceForm,
  type ServiceFormResponse,
} from "@/services/service-catalog-api";

vi.mock("@/services/service-catalog-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/service-catalog-api")>();
  return {
    ...actual,
    getServiceForm: vi.fn(),
    createServiceForm: vi.fn(),
  };
});

const emptyForm = (serviceId: string): ServiceFormResponse => ({
  serviceId,
  activeFormVersionRef: null,
  versions: [],
});

const draftForm = (serviceId: string): ServiceFormResponse => ({
  serviceId,
  activeFormVersionRef: null,
  versions: [
    {
      formVersionRef: "fv-1",
      serviceId,
      version: 1,
      status: "DRAFT",
      schema: defaultServiceFormSchema,
    },
  ],
});

describe("ensureServiceForm", () => {
  beforeEach(() => {
    vi.mocked(getServiceForm).mockReset();
    vi.mocked(createServiceForm).mockReset();
  });

  it("creates the first form when GET returns an empty version list", async () => {
    const created = draftForm("svc-1");
    vi.mocked(getServiceForm)
      .mockResolvedValueOnce(emptyForm("svc-1"))
      .mockResolvedValueOnce(created);
    vi.mocked(createServiceForm).mockResolvedValue(created.versions[0]!);

    const loaded = await ensureServiceForm("svc-1", true);

    expect(createServiceForm).toHaveBeenCalledWith("svc-1", defaultServiceFormSchema);
    expect(loaded.versions).toHaveLength(1);
  });

  it("does not create when versions already exist", async () => {
    vi.mocked(getServiceForm).mockResolvedValue(draftForm("svc-1"));

    await ensureServiceForm("svc-1", true);

    expect(createServiceForm).not.toHaveBeenCalled();
  });

  it("does not create an empty list without write permission", async () => {
    vi.mocked(getServiceForm).mockResolvedValue(emptyForm("svc-1"));

    const loaded = await ensureServiceForm("svc-1", false);

    expect(createServiceForm).not.toHaveBeenCalled();
    expect(loaded.versions).toHaveLength(0);
  });
});
