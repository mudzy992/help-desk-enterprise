import { describe, expect, it } from "vitest";
import { mapServiceFormsError } from "@/lib/services/map-service-forms-error";
import { ApiError } from "@/services/api";

describe("mapServiceFormsError", () => {
  it("maps form version codes", () => {
    expect(mapServiceFormsError(new ApiError(409, "FORM_VERSION_IMMUTABLE", "x"))).toBe(
      "services.forms.errorImmutable",
    );
    expect(mapServiceFormsError(new ApiError(400, "FORM_VERSION_NOT_DRAFT", "x"))).toBe(
      "services.forms.errorNotDraft",
    );
    expect(mapServiceFormsError(new ApiError(400, "INVALID_FIELD_CONFIGURATION", "x"))).toBe(
      "services.forms.errorFieldConfig",
    );
    expect(mapServiceFormsError(new ApiError(400, "INVALID_FIELD_IDENTIFIER", "x"))).toBe(
      "services.forms.errorFieldId",
    );
    expect(mapServiceFormsError(new ApiError(400, "DUPLICATE_FIELD_IDENTIFIER", "x"))).toBe(
      "services.forms.errorDuplicateField",
    );
  });
});
