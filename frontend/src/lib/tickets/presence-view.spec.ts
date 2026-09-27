import { describe, expect, it } from "vitest";
import { applyPresenceUpdate, collidingTypist } from "@/lib/tickets/presence-view";

describe("presence view (Paket 2.4)", () => {
  const staffPayload = {
    ticketId: "t1",
    audience: "staff",
    people: [
      { userId: "me", name: "Ja", role: "staff", state: "viewing", channel: "public" },
      { userId: "u2", name: "Amra", role: "staff", state: "typing", channel: "public" },
      { userId: "u3", name: "Edin", role: "staff", state: "typing", channel: "internal" },
    ],
  };

  it("hides me and ignores other tickets", () => {
    expect(applyPresenceUpdate("t1", "me", staffPayload)?.others.map((person) => person.userId)).toEqual(["u2", "u3"]);
    expect(applyPresenceUpdate("t2", "me", staffPayload)).toBeNull();
  });

  it("finds only a public typist for the collision warning", () => {
    const view = applyPresenceUpdate("t1", "me", staffPayload);
    expect(view === null ? null : collidingTypist(view)?.name).toBe("Amra");
  });

  it("gives the requester only the anonymous flag", () => {
    expect(applyPresenceUpdate("t1", "req", { ticketId: "t1", audience: "requester", agentTyping: true })).toEqual({
      others: [],
      agentTyping: true,
    });
  });
});
