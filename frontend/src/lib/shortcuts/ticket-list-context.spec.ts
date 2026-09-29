import { describe, expect, it } from "vitest";
import { adjacentTicket, readTicketListContext, saveTicketListContext, TICKET_LIST_CONTEXT_KEY } from "./ticket-list-context";

function memory() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), map };
}

describe("ticket list context", () => {
  it("round-trips ids and caps them at 500", () => {
    const store = memory();
    saveTicketListContext({ ids: Array.from({ length: 600 }, (_, i) => `t${i}`), listUrl: "/tickets?view=all" }, store);
    const context = readTicketListContext(store);
    expect(context?.ids).toHaveLength(500);
    expect(context?.listUrl).toBe("/tickets?view=all");
  });

  it("rejects malformed data and non-relative urls", () => {
    const store = memory();
    store.setItem(TICKET_LIST_CONTEXT_KEY, "{bad");
    expect(readTicketListContext(store)).toBeNull();
    store.setItem(TICKET_LIST_CONTEXT_KEY, JSON.stringify({ ids: ["a"], listUrl: "//evil.example.com" }));
    expect(readTicketListContext(store)).toBeNull();
    store.setItem(TICKET_LIST_CONTEXT_KEY, JSON.stringify({ ids: ["a", 3], listUrl: "/tickets" }));
    expect(readTicketListContext(store)?.ids).toEqual(["a"]);
  });

  it("finds neighbours, edges and missing context", () => {
    const context = { ids: ["a", "b", "c"], listUrl: "/tickets" };
    expect(adjacentTicket(context, "b", 1)).toEqual({ kind: "ticket", id: "c" });
    expect(adjacentTicket(context, "b", -1)).toEqual({ kind: "ticket", id: "a" });
    expect(adjacentTicket(context, "c", 1)).toEqual({ kind: "edge" });
    expect(adjacentTicket(context, "z", 1)).toEqual({ kind: "no-context" });
    expect(adjacentTicket(null, "a", 1)).toEqual({ kind: "no-context" });
  });
});
