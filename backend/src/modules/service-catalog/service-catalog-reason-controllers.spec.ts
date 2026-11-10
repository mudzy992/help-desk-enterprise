import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from "../authentication/authenticated-request";
import { ServiceCategoriesController } from "./service-categories.controller";
import { ServiceFormsController } from "./service-forms.controller";
import { ServicesController } from "./services.controller";

jest.mock("../../common/prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

const request = {
  [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
    subjectId: "admin-1",
    email: "admin@example.test",
    displayName: "Admin",
    isLocalOnly: true,
  },
};

const schema = { schemaVersion: 1, fields: [] };

describe("service catalog mutation reason controllers", () => {
  it("forwards caller reasons for service and category deletion", async () => {
    const catalog = {
      delete: jest.fn().mockResolvedValue(undefined),
      deleteCategory: jest.fn().mockResolvedValue(undefined),
    };
    const services = new ServicesController(catalog as never);
    const categories = new ServiceCategoriesController(catalog as never);

    await services.delete(
      "service-1",
      { reason: "Remove unused draft" },
      request,
    );
    await categories.delete(
      "category-1",
      { reason: "Retire empty group" },
      request,
    );

    expect(catalog.delete).toHaveBeenCalledWith(
      "service-1",
      { actorUserId: "admin-1" },
      "Remove unused draft",
    );
    expect(catalog.deleteCategory).toHaveBeenCalledWith(
      "category-1",
      { actorUserId: "admin-1" },
      "Retire empty group",
    );
  });

  it("forwards reasons from every service-form mutation body", async () => {
    const forms = {
      createForm: jest.fn().mockResolvedValue({}),
      createFormVersion: jest.fn().mockResolvedValue({}),
      updateFormVersion: jest.fn().mockResolvedValue({}),
      activateFormVersion: jest.fn().mockResolvedValue({}),
    };
    const controller = new ServiceFormsController(forms as never);

    await controller.createForm(
      "service-1",
      { schema, reason: "Create the form" },
      request,
    );
    await controller.createFormVersion(
      "service-1",
      { schema, reason: "Add the next form version" },
      request,
    );
    await controller.updateFormVersion(
      "service-1",
      "version-2",
      { schema, reason: "Adjust the draft fields" },
      request,
    );
    await controller.activateFormVersion(
      "service-1",
      "version-2",
      { reason: "Approve the form for use" },
      request,
    );

    expect(forms.createForm).toHaveBeenCalledWith(
      "service-1",
      { schema, reason: "Create the form" },
      { actorUserId: "admin-1" },
    );
    expect(forms.createFormVersion).toHaveBeenCalledWith(
      "service-1",
      { schema, reason: "Add the next form version" },
      { actorUserId: "admin-1" },
    );
    expect(forms.updateFormVersion).toHaveBeenCalledWith(
      "service-1",
      "version-2",
      { schema, reason: "Adjust the draft fields" },
      { actorUserId: "admin-1" },
    );
    expect(forms.activateFormVersion).toHaveBeenCalledWith(
      "service-1",
      "version-2",
      { actorUserId: "admin-1" },
      "Approve the form for use",
    );
  });
});
