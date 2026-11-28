import { describe, expect, it } from "vitest";
import { mapRbacError } from "@/lib/rbac/map-rbac-error";
import { ApiError } from "@/services/api";

/*
  W2.36b: the panel's message for a refused write is derived from the server code
  first. `SYSTEM_ROLE_PERMISSIONS_IMMUTABLE` used to arrive without a code branch
  and therefore as a bare 403, which the panel rendered as "you are not allowed to
  manage role permissions".
*/
describe("mapRbacError (W2.36b)", () => {
  it("names the locked SuperAdmin matrix instead of reporting a permission failure", () => {
    const error = new ApiError(
      409,
      "SYSTEM_ROLE_PERMISSIONS_IMMUTABLE",
      "The SuperAdmin permission matrix is fixed by design",
      "req-super-admin-matrix",
    );

    expect(mapRbacError(error)).toBe("permissions.errorSystemRoleImmutable");
  });

  it("still reports a genuine 403 as a permission failure", () => {
    expect(mapRbacError(new ApiError(403, "FORBIDDEN", "Forbidden", null))).toBe(
      "permissions.errorForbidden",
    );
  });
});
