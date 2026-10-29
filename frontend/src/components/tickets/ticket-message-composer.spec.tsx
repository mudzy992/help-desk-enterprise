// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketMessageComposer } from "@/components/tickets/ticket-message-composer";
import { ticketComposerDraftStorageKey } from "@/lib/tickets/ticket-draft-storage";
import { renderTicketTemplate, type RenderedTemplate } from "@/services/templates-api";

const { renderTicketTemplateMock, sessionMock } = vi.hoisted(() => ({
  renderTicketTemplateMock: vi.fn(),
  sessionMock: { currentUserId: "user-a" as string | null },
}));
vi.mock("@/lib/session/use-session", () => ({ useSession: () => sessionMock }));
vi.mock("@/services/templates-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/templates-api")>();
  return { ...actual, renderTicketTemplate: renderTicketTemplateMock };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

function renderComposer(ticketId: string, onSend = vi.fn().mockResolvedValue(undefined)) {
  return render(
    <TicketMessageComposer ticketId={ticketId} access="staff" isSending={false} onSend={onSend} />,
  );
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  sessionMock.currentUserId = "user-a";
});

describe("TicketMessageComposer session draft", () => {
  it("restores a draft after remount and keeps drafts isolated per ticket", async () => {
    const first = renderComposer("ticket-1");
    fireEvent.change(screen.getByTestId("ticket-composer-body"), {
      target: { value: "Ticket one draft" },
    });
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem(ticketComposerDraftStorageKey("user-a", "ticket-1")),
      ).toContain("Ticket one draft"),
    );
    first.unmount();

    const second = renderComposer("ticket-2");
    expect(screen.getByTestId("ticket-composer-body")).toHaveProperty("value", "");
    second.unmount();

    renderComposer("ticket-1");
    expect(screen.getByTestId("ticket-composer-body")).toHaveProperty("value", "Ticket one draft");
  });

  it("does not restore another account's draft for the same ticket", async () => {
    const first = renderComposer("shared-ticket");
    fireEvent.change(screen.getByTestId("ticket-composer-body"), {
      target: { value: "User A private draft" },
    });
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem(ticketComposerDraftStorageKey("user-a", "shared-ticket")),
      ).toContain("User A private draft"),
    );
    sessionMock.currentUserId = "user-b";
    first.rerender(
      <TicketMessageComposer
        ticketId="shared-ticket"
        access="staff"
        isSending={false}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByTestId("ticket-composer-body")).toHaveProperty("value", "");
    expect(
      window.sessionStorage.getItem(ticketComposerDraftStorageKey("user-a", "shared-ticket")),
    ).toContain("User A private draft");
  });

  it("keeps text typed while an asynchronous template is rendering", async () => {
    let resolveTemplate!: (template: RenderedTemplate) => void;
    const pendingTemplate = new Promise<RenderedTemplate>((resolve) => {
      resolveTemplate = resolve;
    });
    renderTicketTemplateMock.mockReset().mockReturnValueOnce(pendingTemplate);
    render(
      <TicketMessageComposer
        ticketId="ticket-template"
        access="staff"
        isSending={false}
        onSend={vi.fn().mockResolvedValue(undefined)}
        templates={{
          ticketId: "ticket-template",
          canSavePersonal: false,
          insertRequest: { templateId: "template-1", name: "Welcome", nonce: 1 },
        }}
      />,
    );
    await waitFor(() =>
      expect(renderTicketTemplate).toHaveBeenCalledWith("ticket-template", "template-1"),
    );

    const editor = screen.getByTestId("ticket-composer-body");
    fireEvent.change(editor, { target: { value: "typed while the template is rendering" } });
    await act(async () => {
      resolveTemplate({
        templateId: "template-1",
        text: "Hello from the template",
        locale: "en",
        missing: [],
        unknown: [],
      });
      await pendingTemplate;
    });

    expect(editor).toHaveProperty(
      "value",
      "Hello from the template\ntyped while the template is rendering",
    );
  });

  it("clears the per-ticket draft only after a successful send", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    renderComposer("ticket-send", onSend);
    fireEvent.change(screen.getByTestId("ticket-composer-body"), {
      target: { value: "Ready to send" },
    });
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem(ticketComposerDraftStorageKey("user-a", "ticket-send")),
      ).not.toBe(null),
    );

    fireEvent.click(screen.getByRole("button", { name: "tickets.detail.send" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("AGENT_REPLY", "Ready to send", undefined);
      expect(
        window.sessionStorage.getItem(ticketComposerDraftStorageKey("user-a", "ticket-send")),
      ).toBeNull();
      expect(screen.getByTestId("ticket-composer-body")).toHaveProperty("value", "");
    });
  });

  it("keeps the saved draft when sending fails", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("offline"));
    renderComposer("ticket-failed-send", onSend);
    fireEvent.change(screen.getByTestId("ticket-composer-body"), {
      target: { value: "Do not lose this" },
    });
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem(
          ticketComposerDraftStorageKey("user-a", "ticket-failed-send"),
        ),
      ).not.toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "tickets.detail.send" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    expect(screen.getByTestId("ticket-composer-body")).toHaveProperty("value", "Do not lose this");
    expect(
      window.sessionStorage.getItem(ticketComposerDraftStorageKey("user-a", "ticket-failed-send")),
    ).toContain("Do not lose this");
  });
});
