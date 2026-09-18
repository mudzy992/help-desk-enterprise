import { describe, expect, it } from "vitest";
import { roleKeys } from "@/lib/session/permission-keys";
import {
  canChooseTicketOriginUnit,
  nextDraftOriginUnitId,
  originUnitOptionsForSelect,
  resolveCreateTicketOriginUnit,
  resolveOriginUnitDisplayName,
  resolvePreferredOriginUnitId,
} from "@/lib/tickets/current-user-origin-unit";
import type { CurrentSessionResponse } from "@/services/session-api";

const originUnits = [
  { id: "ou-root", label: "/Korisnici" },
  { id: "ou-it", label: "/Korisnici/IT" },
];

function session(input: {
  readonly roleKeys: readonly string[];
  readonly isSuperAdmin?: boolean;
  readonly organizationalUnitId?: string | null;
  readonly organizationalUnitName?: string | null;
}): CurrentSessionResponse {
  return {
    principal: {
      subjectId: "user-1",
      email: "user@example.com",
      displayName: "User",
      isLocalOnly: false,
    },
    isSuperAdmin: input.isSuperAdmin ?? false,
    roleKeys: input.roleKeys,
    permissionKeys: [],
    organizationalUnitId: input.organizationalUnitId ?? null,
    organizationalUnitName: input.organizationalUnitName ?? null,
  };
}

describe("current user origin unit", () => {
  it("locks the origin unit field for USER and keeps it editable for AGENT", () => {
    expect(canChooseTicketOriginUnit(session({ roleKeys: [roleKeys.user] }))).toBe(
      false,
    );
    expect(
      canChooseTicketOriginUnit(session({ roleKeys: [roleKeys.agent] })),
    ).toBe(true);
    expect(
      canChooseTicketOriginUnit(session({ roleKeys: [roleKeys.admin] })),
    ).toBe(true);
    expect(
      canChooseTicketOriginUnit(
        session({ roleKeys: [], isSuperAdmin: true }),
      ),
    ).toBe(true);
  });

  it("prefers the session home unit over the single-unit catalog fallback", () => {
    expect(
      resolvePreferredOriginUnitId({
        homeOrganizationalUnitId: "ou-it",
        originUnits,
      }),
    ).toBe("ou-it");
    expect(
      resolvePreferredOriginUnitId({
        homeOrganizationalUnitId: null,
        originUnits: [originUnits[1]!],
      }),
    ).toBe("ou-it");
    expect(
      resolvePreferredOriginUnitId({
        homeOrganizationalUnitId: null,
        originUnits,
      }),
    ).toBe("");
  });

  it("shows the organizational unit name instead of an id", () => {
    expect(
      resolveOriginUnitDisplayName({
        homeOrganizationalUnitName: "IT Breza",
        homeOrganizationalUnitId: "ou-it",
        originUnits,
      }),
    ).toBe("IT Breza");
  });

  it("keeps a locked USER origin unit in sync and does not overwrite an AGENT choice", () => {
    expect(
      nextDraftOriginUnitId({
        currentOriginUnitId: "",
        preferredOriginUnitId: "ou-it",
        isOriginUnitLocked: true,
        hasUserChosenOriginUnit: false,
      }),
    ).toBe("ou-it");
    expect(
      nextDraftOriginUnitId({
        currentOriginUnitId: "ou-root",
        preferredOriginUnitId: "ou-it",
        isOriginUnitLocked: false,
        hasUserChosenOriginUnit: true,
      }),
    ).toBe("ou-root");
  });

  it("adds the session home unit to the select when the tree omitted it", () => {
    expect(
      originUnitOptionsForSelect([], { id: "ou-it", name: "IT Breza" }),
    ).toEqual([{ id: "ou-it", label: "IT Breza" }]);
  });

  it("maps USER to a locked origin unit field and AGENT to a prefilled select", () => {
    const userOrigin = resolveCreateTicketOriginUnit({
      session: session({
        roleKeys: [roleKeys.user],
        organizationalUnitId: "ou-it",
        organizationalUnitName: "IT Breza",
      }),
      originUnits,
    });
    expect(userOrigin.canChooseOriginUnit).toBe(false);
    expect(userOrigin.preferredOriginUnitId).toBe("ou-it");
    expect(userOrigin.originUnitDisplayName).toBe("IT Breza");
    const agentOrigin = resolveCreateTicketOriginUnit({
      session: session({
        roleKeys: [roleKeys.agent],
        organizationalUnitId: "ou-it",
        organizationalUnitName: "IT Breza",
      }),
      originUnits,
    });
    expect(agentOrigin.canChooseOriginUnit).toBe(true);
    expect(agentOrigin.preferredOriginUnitId).toBe("ou-it");
  });
});
