// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "./template-picker";
import {
  listPickerTemplates,
  renderTicketTemplate,
  type ResponseTemplatePickerItem,
} from "@/services/templates-api";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/a11y/use-dismissable", () => ({ useDismissable: vi.fn() }));
vi.mock("@/services/templates-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/templates-api")>();
  return {
    ...actual,
    listPickerTemplates: vi.fn(),
    renderTicketTemplate: vi.fn(),
  };
});

const pickerItem = (id: string, name: string): ResponseTemplatePickerItem => ({
  id,
  name,
  kind: "REPLY",
  tags: [],
  ownership: "shared",
  scopeMatch: 3,
  usageCount: 0,
  preview: `${name} preview`,
  hasEnglish: false,
});

const page = (
  items: readonly ResponseTemplatePickerItem[],
  nextCursor: string | null,
  hasMore: boolean,
  cursor: string | null = null,
) => ({ items, take: 50, cursor, nextCursor, hasMore });

describe("TemplatePicker pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(renderTicketTemplate).mockResolvedValue({
      templateId: "template-1",
      text: "Preview",
      locale: "bs",
      missing: [],
      unknown: [],
    });
  });
  afterEach(cleanup);

  it("loads additional picker candidates instead of hiding results beyond the first page", async () => {
    vi.mocked(listPickerTemplates)
      .mockResolvedValueOnce(
        page([pickerItem("template-1", "First template")], "picker-cursor", true),
      )
      .mockResolvedValueOnce(
        page([pickerItem("template-2", "Next template")], null, false, "picker-cursor"),
      );

    render(
      <TemplatePicker ticketId="ticket-1" kind="REPLY" onClose={vi.fn()} onInsert={vi.fn()} />,
    );

    await screen.findAllByText("First template");
    fireEvent.click(screen.getByRole("button", { name: "templates.picker.loadMore" }));
    await screen.findAllByText("Next template");

    expect(listPickerTemplates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ticketId: "ticket-1", cursor: "picker-cursor" }),
    );
    expect(screen.getAllByText("First template").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "templates.picker.loadMore" })).toBeNull();
    });
  });
});
