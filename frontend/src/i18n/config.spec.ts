import { beforeEach, describe, expect, it, vi } from "vitest";

const addResourceBundle = vi.fn();
const hasResourceBundle = vi.fn(() => false);
vi.mock("i18next", () => ({
  default: {
    isInitialized: true,
    hasResourceBundle,
    addResourceBundle,
    on: vi.fn(),
    use: vi.fn().mockReturnThis(),
    init: vi.fn(),
  },
}));
vi.mock("react-i18next", () => ({ initReactI18next: {} }));

describe("lazy locale resources", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads and registers only the requested locale", async () => {
    const { ensureLocaleResources } = await import("@/i18n/config");
    await ensureLocaleResources("en");
    expect(addResourceBundle).toHaveBeenCalledTimes(1);
    expect(addResourceBundle).toHaveBeenCalledWith("en", "common", expect.any(Object), true, true);
  });

  it("deduplicates concurrent loads", async () => {
    const { ensureLocaleResources } = await import("@/i18n/config");
    await Promise.all([ensureLocaleResources("bs"), ensureLocaleResources("bs")]);
    expect(addResourceBundle).toHaveBeenCalledTimes(1);
  });
});
