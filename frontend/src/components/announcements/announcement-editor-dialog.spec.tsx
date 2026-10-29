// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementEditorDialog } from "./announcement-editor-dialog";
import type { AnnouncementOptions } from "@/services/announcements-api";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  preview: vi.fn(),
  update: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/services/announcements-api", async (original) => ({
  ...(await original<typeof import("@/services/announcements-api")>()),
  createAnnouncement: mocks.create,
  previewAnnouncementAudience: mocks.preview,
  updateAnnouncement: mocks.update,
}));

const options: AnnouncementOptions = {
  canManage: true,
  scopedToUnit: false,
  canReadReports: true,
  maxDurationDays: 30,
  emailAvailable: false,
  teamsAvailable: false,
  organizationalUnits: [],
  groups: [],
  services: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderEditor() {
  const onSaved = vi.fn();
  render(
    <AnnouncementEditorDialog
      open
      onOpenChange={vi.fn()}
      options={options}
      announcement={null}
      onSaved={onSaved}
    />,
  );
  fireEvent.change(screen.getByLabelText(/announcements\.editor\.title/), {
    target: { value: "Maintenance" },
  });
  fireEvent.change(screen.getByLabelText(/announcements\.editor\.body/), {
    target: { value: "Systems restart" },
  });
  return { onSaved };
}

describe("AnnouncementEditorDialog state machine", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.preview.mockReset().mockResolvedValue({ count: 10 });
    mocks.update.mockReset();
  });
  afterEach(cleanup);

  it("rejects an end before start without calling the API", () => {
    renderEditor();
    const starts = screen.getByLabelText(/announcements\.editor\.startsAt/);
    const ends = screen.getByLabelText(/announcements\.editor\.endsAt/);
    fireEvent.change(starts, { target: { value: "2026-10-21T10:00" } });
    fireEvent.change(ends, { target: { value: "2026-10-21T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "announcements.editor.saveDraft" }));

    expect(screen.getByRole("alert").textContent).toBe("announcements.errors.order");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("guards synchronous double save and forwards normalized instants once", async () => {
    const request = deferred<Record<string, unknown>>();
    mocks.create.mockReturnValue(request.promise);
    const { onSaved } = renderEditor();
    const save = screen.getByRole("button", { name: "announcements.editor.saveDraft" });

    fireEvent.click(save);
    fireEvent.click(save);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.create.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        title: "Maintenance",
        body: "Systems restart",
        startsAt: expect.stringMatching(/Z$/),
        endsAt: expect.stringMatching(/Z$/),
      }),
    );

    const saved = { id: "announcement-1" };
    request.resolve(saved);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });
});
