import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from "../authentication/authenticated-request";
import { ServiceAvailabilityController } from "./service-availability.controller";
import { ServiceCategoriesController } from "./service-categories.controller";
import { ServicesController } from "./services.controller";

const serviceResponse = { id: "service-1", revision: 4 } as never;
const categoryResponse = { id: "category-1", revision: 7 } as never;
const actorRequest = {
  [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
    subjectId: "actor-1",
    email: "actor@example.test",
    displayName: "Actor",
    isLocalOnly: true,
  },
};

function createHeaderResponse() {
  return { setHeader: jest.fn() };
}

describe("service catalog revision headers", () => {
  it("emits a strong ETag for service GET, create, metadata update, and lifecycle update", async () => {
    const service = {
      create: jest.fn().mockResolvedValue(serviceResponse),
      getById: jest.fn().mockResolvedValue(serviceResponse),
      update: jest.fn().mockResolvedValue(serviceResponse),
      transitionLifecycle: jest.fn().mockResolvedValue(serviceResponse),
    };
    const controller = new ServicesController(service as never);

    for (const operation of [
      (headers: ReturnType<typeof createHeaderResponse>) =>
        controller.getById("service-1", actorRequest, headers),
      (headers: ReturnType<typeof createHeaderResponse>) =>
        controller.create(
          { name: "VPN", reason: "Add VPN service" } as never,
          actorRequest,
          headers,
        ),
      (headers: ReturnType<typeof createHeaderResponse>) =>
        controller.update(
          "service-1",
          { name: "VPN", reason: "Rename service" } as never,
          actorRequest,
          '"v3"',
          headers,
        ),
      (headers: ReturnType<typeof createHeaderResponse>) =>
        controller.transitionLifecycle(
          "service-1",
          { lifecycle: "ACTIVE", reason: "Publish approved service" } as never,
          actorRequest,
          '"v3"',
          headers,
        ),
    ]) {
      const headers = createHeaderResponse();
      await operation(headers);
      expect(headers.setHeader).toHaveBeenCalledWith("ETag", '"v4"');
    }

    expect(service.update).toHaveBeenCalledWith(
      "service-1",
      { name: "VPN", reason: "Rename service" },
      '"v3"',
      { actorUserId: "actor-1" },
    );
    expect(service.transitionLifecycle).toHaveBeenCalledWith(
      "service-1",
      { lifecycle: "ACTIVE", reason: "Publish approved service" },
      '"v3"',
      { actorUserId: "actor-1" },
    );
  });

  it("emits category GET/create/update ETags and forwards the category If-Match value", async () => {
    const service = {
      createCategory: jest.fn().mockResolvedValue(categoryResponse),
      getCategory: jest.fn().mockResolvedValue(categoryResponse),
      updateCategory: jest.fn().mockResolvedValue(categoryResponse),
    };
    const controller = new ServiceCategoriesController(service as never);
    const getHeaders = createHeaderResponse();
    await controller.getById("category-1", getHeaders);
    expect(getHeaders.setHeader).toHaveBeenCalledWith("ETag", '"v7"');

    const createHeaders = createHeaderResponse();
    await controller.create(
      {
        name: "Support",
        slug: "support",
        reason: "Add service group",
      } as never,
      actorRequest,
      createHeaders,
    );
    expect(createHeaders.setHeader).toHaveBeenCalledWith("ETag", '"v7"');

    const updateHeaders = createHeaderResponse();
    await controller.update(
      "category-1",
      { name: "Renamed", reason: "Rename service group" } as never,
      actorRequest,
      '"v6"',
      updateHeaders,
    );
    expect(service.updateCategory).toHaveBeenCalledWith(
      "category-1",
      { name: "Renamed", reason: "Rename service group" },
      '"v6"',
      { actorUserId: "actor-1" },
    );
    expect(updateHeaders.setHeader).toHaveBeenCalledWith("ETag", '"v7"');
  });

  it("requires If-Match and returns the new ETag for availability updates", async () => {
    const service = {
      updateAvailability: jest.fn().mockResolvedValue(serviceResponse),
    };
    const controller = new ServiceAvailabilityController(service as never);
    const headers = createHeaderResponse();
    await controller.updateAvailability(
      "service-1",
      { availability: "DOWN" } as never,
      actorRequest,
      '"v3"',
      headers,
    );
    expect(service.updateAvailability).toHaveBeenCalledWith(
      "service-1",
      { availability: "DOWN" },
      '"v3"',
      { actorUserId: "actor-1" },
    );
    expect(headers.setHeader).toHaveBeenCalledWith("ETag", '"v4"');
  });
});
