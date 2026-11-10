import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
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
  formsEnabled: true,
  requireVersionOnTicket: true,
  activeFormVersionRef: null,
  activeForm: null,
  versions: [],
  total: 0,
  take: 20,
  cursor: null,
  nextCursor: null,
  hasMore: false,
});

const draftForm = (serviceId: string): ServiceFormResponse => ({
  ...emptyForm(serviceId),
  versions: [
    {
      formVersionRef: "fv-1",
      serviceId,
      version: 1,
      status: "DRAFT",
      schema: { schemaVersion: 1, fields: [] },
    },
  ],
  total: 1,
});

describe("ensureServiceForm", () => {
  beforeEach(() => {
    vi.mocked(getServiceForm).mockReset();
    vi.mocked(createServiceForm).mockReset();
  });

  it("returns an empty form without creating a mutation as a read side effect", async () => {
    const empty = emptyForm("svc-1");
    vi.mocked(getServiceForm).mockResolvedValue(empty);

    await expect(ensureServiceForm("svc-1")).resolves.toBe(empty);

    expect(getServiceForm).toHaveBeenCalledWith("svc-1");
    expect(createServiceForm).not.toHaveBeenCalled();
  });

  it("returns the loaded form when versions already exist", async () => {
    const loaded = draftForm("svc-1");
    vi.mocked(getServiceForm).mockResolvedValue(loaded);

    await expect(ensureServiceForm("svc-1")).resolves.toBe(loaded);
    expect(createServiceForm).not.toHaveBeenCalled();
  });

  it("propagates an initial read outage without attempting a create", async () => {
    vi.mocked(getServiceForm).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "offline"));

    await expect(ensureServiceForm("svc-1")).rejects.toMatchObject({ status: 503 });
    expect(createServiceForm).not.toHaveBeenCalled();
  });
});
