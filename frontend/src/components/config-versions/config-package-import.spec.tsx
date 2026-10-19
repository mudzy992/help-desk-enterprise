// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigPackageImport } from "@/components/config-versions/config-package-import";
import { ApiError } from "@/services/api";
import { importConfigPackage, previewConfigPackageImport } from "@/services/config-versions-api";
import type { ConfigPackageImportReport, ConfigVersion } from "@/services/config-versions-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "configVersions.package.sourceValue") return String(values?.environment);
      if (key === "errors.requestId") return `${key}:${String(values?.requestId)}`;
      return key;
    },
  }),
}));
vi.mock("@/services/config-versions-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/config-versions-api")>();
  return {
    ...actual,
    previewConfigPackageImport: vi.fn(),
    importConfigPackage: vi.fn(),
  };
});

const report = (sourceEnvironment: string): ConfigPackageImportReport => ({
  header: {
    appVersion: "1.0.0",
    sourceEnvironment,
    sourceVersion: 4,
    exportedAt: "2026-10-19T00:00:00.000Z",
    includesEnvironmentBound: true,
  },
  candidates: {},
  checksum: "checksum",
  signature: "valid",
  items: [],
  settings: { applied: [], skippedEnvironmentBound: [], skippedUnknown: [] },
  created: { calendars: [], slaProfiles: [] },
  skipped: {},
  blockingCount: 0,
  canImport: true,
});

const importedVersion: ConfigVersion = {
  id: "version-4",
  version: 4,
  status: "DRAFT",
  releaseNotes: null,
  createdByUserId: null,
  activatedAt: null,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
  rollbackOfVersion: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function selectPackage() {
  const input = screen.getByLabelText("configVersions.package.file") as HTMLInputElement;
  const file = new File(["{}"], "config.json", { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe("ConfigPackageImport", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("keeps preview local and uses the workspace mutation runner only for import", async () => {
    vi.mocked(previewConfigPackageImport).mockResolvedValue(report("preview-source"));
    vi.mocked(importConfigPackage).mockResolvedValue(importedVersion);
    const runAction = vi.fn(async (operation: () => Promise<void>) => {
      await operation();
      return true;
    });
    const onImported = vi.fn();
    render(<ConfigPackageImport isBusy={false} runAction={runAction} onImported={onImported} />);

    selectPackage();
    fireEvent.click(screen.getByRole("button", { name: /configVersions.package.preview/ }));
    await screen.findByText("preview-source");
    expect(runAction).not.toHaveBeenCalled();

    const importButton = screen.getByRole("button", {
      name: "configVersions.package.import",
    }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(false);
    fireEvent.click(importButton);

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(importedVersion));
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("renders only the latest result when preview answers arrive out of order", async () => {
    const stale = deferred<ConfigPackageImportReport>();
    const latest = deferred<ConfigPackageImportReport>();
    vi.mocked(previewConfigPackageImport)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    render(<ConfigPackageImport isBusy={false} runAction={vi.fn()} onImported={vi.fn()} />);

    selectPackage();
    const previewButton = screen.getByRole("button", {
      name: /configVersions.package.preview/,
    });
    fireEvent.click(previewButton);
    fireEvent.click(previewButton);

    await act(async () => {
      latest.resolve(report("latest-source"));
      await latest.promise;
    });
    expect(screen.getByText("latest-source")).toBeTruthy();

    await act(async () => {
      stale.resolve(report("stale-source"));
      await stale.promise;
    });
    expect(screen.queryByText("stale-source")).toBeNull();
    expect(screen.getByText("latest-source")).toBeTruthy();
  });

  it("invalidates a report when a preview-relevant option changes", async () => {
    vi.mocked(previewConfigPackageImport).mockResolvedValue(report("source"));
    render(<ConfigPackageImport isBusy={false} runAction={vi.fn()} onImported={vi.fn()} />);
    selectPackage();
    fireEvent.click(screen.getByRole("button", { name: /configVersions.package.preview/ }));
    await screen.findByText("source");

    const importButton = screen.getByRole("button", {
      name: "configVersions.package.import",
    }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("configVersions.package.applyEnvironmentBound"));
    expect(importButton.disabled).toBe(true);
  });

  it("requires explicit confirmation before an unsigned package becomes importable", async () => {
    vi.mocked(previewConfigPackageImport).mockResolvedValue({
      ...report("unsigned-source"),
      signature: "unsigned",
    });
    render(<ConfigPackageImport isBusy={false} runAction={vi.fn()} onImported={vi.fn()} />);
    selectPackage();
    fireEvent.click(screen.getByRole("button", { name: /configVersions.package.preview/ }));
    await screen.findByText("unsigned-source");

    const importButton = screen.getByRole("button", {
      name: "configVersions.package.import",
    }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("configVersions.package.confirmUnsigned"));
    expect(importButton.disabled).toBe(false);
  });

  it("keeps the valid report when the workspace import runner reports failure", async () => {
    vi.mocked(previewConfigPackageImport).mockResolvedValue(report("source"));
    vi.mocked(importConfigPackage).mockRejectedValue(new Error("import failed"));
    const runAction = vi.fn(async (operation: () => Promise<void>) => {
      try {
        await operation();
        return true;
      } catch {
        return false;
      }
    });
    const onImported = vi.fn();
    render(<ConfigPackageImport isBusy={false} runAction={runAction} onImported={onImported} />);
    selectPackage();
    fireEvent.click(screen.getByRole("button", { name: /configVersions.package.preview/ }));
    await screen.findByText("source");
    fireEvent.click(screen.getByRole("button", { name: "configVersions.package.import" }));

    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByText("source")).toBeTruthy();
  });

  it("rejects an oversized file before preview", () => {
    render(<ConfigPackageImport isBusy={false} runAction={vi.fn()} onImported={vi.fn()} />);
    const input = screen.getByLabelText("configVersions.package.file");
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.json");
    fireEvent.change(input, { target: { files: [oversized] } });

    expect(screen.getByText("configVersions.errorPackageTooLarge")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /configVersions.package.preview/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(previewConfigPackageImport).not.toHaveBeenCalled();
  });

  it("maps preview errors locally with their request id and leaves import disabled", async () => {
    vi.mocked(previewConfigPackageImport).mockRejectedValue(
      new ApiError(400, "CONFIG_PACKAGE_INVALID", "invalid", "preview-request"),
    );
    const runAction = vi.fn();
    render(<ConfigPackageImport isBusy={false} runAction={runAction} onImported={vi.fn()} />);
    selectPackage();
    fireEvent.click(screen.getByRole("button", { name: /configVersions.package.preview/ }));

    await screen.findByText("configVersions.errorPackageInvalid");
    expect(screen.getByText("errors.requestId:preview-request")).toBeTruthy();
    expect(runAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "configVersions.package.import" })).toBeNull();
  });
});
