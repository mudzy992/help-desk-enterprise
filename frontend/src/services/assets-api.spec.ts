import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import {
  assetQueryKeys,
  buildAssetListQuery,
  getAsset,
  getAssetCatalog,
  getAssetDirectorySyncStatus,
  listContracts,
  listLicenses,
  previewAssetImport,
} from "@/services/assets-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const request = vi.mocked(apiRequest);

describe("assets API public facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue({});
  });

  it("preserves register query encoding and stable query keys", () => {
    expect(
      buildAssetListQuery({ search: " laptop ", status: ["IN_USE", "IN_REPAIR"], limit: 50 }),
    ).toBe("?search=laptop&status=IN_USE%2CIN_REPAIR&limit=50");
    expect(assetQueryKeys.detail("asset/1")).toEqual(["assets", "detail", "asset/1"]);
  });

  it("keeps catalog, detail, commercial, import and directory routes unchanged", async () => {
    await getAssetCatalog(true);
    await getAsset("asset/1");
    await listLicenses({ search: "office", expired: true });
    await listContracts({ search: "support", expiringWithinDays: 30 });
    await previewAssetImport({ typeId: "type-1", mode: "UPSERT", file: new File(["x"], "a.csv") });
    await getAssetDirectorySyncStatus();

    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/assets/catalog?includeArchived=true",
      "/assets/asset%2F1",
      "/assets/licenses?search=office&expired=true",
      "/assets/contracts?search=support&expiringWithinDays=30",
      "/assets/import/preview",
      "/assets/directory-sync",
    ]);
  });
});
