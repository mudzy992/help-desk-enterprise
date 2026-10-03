import { afterEach, describe, expect, it, vi } from "vitest";
import {
  docsRecentLimit,
  readDocsFeedback,
  readRecentDocs,
  rememberRecentDoc,
  saveDocsFeedback,
} from "./docs-local";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("docs-local", () => {
  it("bez storagea ne pada i vraća prazno", () => {
    vi.stubGlobal("window", undefined);
    expect(readRecentDocs()).toEqual([]);
    expect(readDocsFeedback("tiketi")).toBeNull();
    expect(rememberRecentDoc("tiketi")).toEqual(["tiketi"]);
  });

  it("pamti nedavno posjećeno bez ponavljanja i do pet stranica", () => {
    vi.stubGlobal("window", { localStorage: createMemoryStorage() });
    for (const slug of ["a", "b", "c", "d", "e", "f"]) {
      expect(rememberRecentDoc(slug)[0]).toBe(slug);
    }
    expect(rememberRecentDoc("c")).toEqual(["c", "f", "e", "d", "b"]);
    const recent = readRecentDocs();
    expect(recent).toHaveLength(docsRecentLimit);
    expect(new Set(recent).size).toBe(docsRecentLimit);
  });

  it("čuva i vraća odgovor na pitanje o pomoći po stranici", () => {
    vi.stubGlobal("window", { localStorage: createMemoryStorage() });
    expect(readDocsFeedback("tiketi")).toBeNull();
    saveDocsFeedback("tiketi", "yes");
    saveDocsFeedback("sla", "no");
    expect(readDocsFeedback("tiketi")).toBe("yes");
    expect(readDocsFeedback("sla")).toBe("no");
    expect(readDocsFeedback("nepoznato")).toBeNull();
  });

  it("trpi pokvaren zapis u storageu", () => {
    const storage = createMemoryStorage();
    storage.setItem("docs.recent", "{nije json");
    vi.stubGlobal("window", { localStorage: storage });
    expect(readRecentDocs()).toEqual([]);
  });
});
