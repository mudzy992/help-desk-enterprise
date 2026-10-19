// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailTemplatesEditor } from "@/components/settings/email-templates-editor";
import {
  previewEmailTemplate,
  saveEmailTemplates,
  sendTestEmailTemplate,
  type EmailTemplateContent,
  type EmailTemplatesOverview,
  type RenderedEmail,
} from "@/services/email-templates-api";

const state = vi.hoisted(() => ({
  blocker: { state: "unblocked" as "unblocked" | "blocked", reset: vi.fn(), proceed: vi.fn() },
  beforeUnload: undefined as ((event: BeforeUnloadEvent) => void) | undefined,
  toast: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useBlocker: () => state.blocker,
    useBeforeUnload: (handler: (event: BeforeUnloadEvent) => void) => {
      state.beforeUnload = handler;
    },
  };
});
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/components/settings/settings-reason-confirm", () => ({
  SettingsReasonConfirm: ({
    pending,
    onConfirm,
    onCancel,
  }: {
    pending: boolean;
    onConfirm: (reason: string) => Promise<void>;
    onCancel: () => void;
  }) => (
    <div>
      <button type="button" disabled={pending} onClick={() => void onConfirm("audit reason")}>
        save-draft
      </button>
      <button type="button" disabled={pending} onClick={onCancel}>
        cancel-draft
      </button>
    </div>
  ),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div>
        <button type="button" onClick={onConfirm}>
          leave-page
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          stay-page
        </button>
      </div>
    ) : null,
}));
vi.mock("@/services/email-templates-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/email-templates-api")>();
  return {
    ...actual,
    previewEmailTemplate: vi.fn(),
    saveEmailTemplates: vi.fn(),
    sendTestEmailTemplate: vi.fn(),
  };
});

const content = (subject: string): EmailTemplateContent => ({
  subject,
  subjectConfidential: `${subject} private`,
  heading: "Heading",
  body: "Body {{ticketNumber}}",
  cta: "Open",
  footer: "Footer",
  accentColor: "",
});

const overview = (subject = "Initial"): EmailTemplatesOverview => ({
  locales: ["bs", "en"],
  keys: ["ticket.created", "account.welcome"],
  ticketKeys: ["ticket.created"],
  fields: ["subject", "subjectConfidential", "heading", "body", "cta", "footer", "accentColor"],
  placeholders: ["ticketNumber"],
  defaults: {
    bs: { "ticket.created": content("Default BS"), "account.welcome": content("Welcome BS") },
    en: { "ticket.created": content("Default EN"), "account.welcome": content("Welcome EN") },
  },
  templates: {
    bs: { "ticket.created": content(subject), "account.welcome": content("Welcome BS") },
    en: { "ticket.created": content("Initial EN"), "account.welcome": content("Welcome EN") },
  },
  overrides: {},
  templatesEnabled: true,
  delivery: {
    deliveryEnabled: true,
    hasSmtpTransport: true,
    provider: "smtp",
    providers: ["smtp"],
    fromAddress: "help@example.test",
    replyMode: "no_reply",
    configuredReplyMode: "no_reply",
    replyToAddress: null,
    publicUrlConfigured: true,
  },
});

const rendered = (subject: string): RenderedEmail => ({
  subject,
  html: `<p>${subject}</p>`,
  text: subject,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function changeSubject(value: string) {
  fireEvent.change(screen.getByTestId("email-template-field-subject"), { target: { value } });
}

describe("EmailTemplatesEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.blocker.state = "unblocked";
    state.beforeUnload = undefined;
    vi.mocked(previewEmailTemplate).mockResolvedValue(rendered("preview"));
    vi.mocked(sendTestEmailTemplate).mockResolvedValue({ toAddress: "admin@example.test" });
    vi.mocked(saveEmailTemplates).mockResolvedValue(overview("Saved"));
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders read-only content while disabling every write path", () => {
    render(<EmailTemplatesEditor overview={overview()} canWrite={false} onSaved={vi.fn()} />);
    expect((screen.getByTestId("email-template-field-subject") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId("email-template-send-test") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByText("save-draft")).toBeNull();
  });

  it("clears an old preview immediately and commits only the latest selection", async () => {
    vi.useFakeTimers();
    const first = deferred<RenderedEmail>();
    const second = deferred<RenderedEmail>();
    vi.mocked(previewEmailTemplate)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<EmailTemplatesEditor overview={overview()} canWrite onSaved={vi.fn()} />);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    fireEvent.change(screen.getByTestId("email-template-key"), {
      target: { value: "account.welcome" },
    });
    expect(screen.queryByTestId("email-template-preview-subject")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(350);
      second.resolve(rendered("latest"));
      await second.promise;
    });
    expect(screen.getByTestId("email-template-preview-subject").textContent).toContain("latest");
    await act(async () => {
      first.resolve(rendered("stale"));
      await first.promise;
    });
    expect(screen.getByTestId("email-template-preview-subject").textContent).toContain("latest");
  });

  it("blocks preview, save and test for an unknown placeholder", async () => {
    render(<EmailTemplatesEditor overview={overview()} canWrite onSaved={vi.fn()} />);
    changeSubject("Bad {{unknown}}");
    expect(screen.getByText("settings.emailTemplates.unknownPlaceholder")).toBeTruthy();
    expect((screen.getByTestId("email-template-send-test") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByText("save-draft")).toBeNull();
  });

  it("mutually excludes test and save and suppresses duplicate test submits", async () => {
    const pending = deferred<{ readonly toAddress: string }>();
    vi.mocked(sendTestEmailTemplate).mockReturnValue(pending.promise);
    render(<EmailTemplatesEditor overview={overview()} canWrite onSaved={vi.fn()} />);
    changeSubject("Changed");
    const test = screen.getByTestId("email-template-send-test");
    fireEvent.click(test);
    fireEvent.click(test);
    expect(sendTestEmailTemplate).toHaveBeenCalledTimes(1);
    expect((screen.getByText("save-draft") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      pending.resolve({ toAddress: "x@example.test" });
      await pending.promise;
    });
  });

  it("saves the current draft, publishes the returned overview and becomes clean", async () => {
    const onSaved = vi.fn();
    const { rerender } = render(
      <EmailTemplatesEditor overview={overview()} canWrite onSaved={onSaved} />,
    );
    changeSubject("Changed");
    fireEvent.click(screen.getByText("save-draft"));
    await waitFor(() => expect(saveEmailTemplates).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
    rerender(<EmailTemplatesEditor overview={overview("Saved")} canWrite onSaved={onSaved} />);
    await waitFor(() => expect(screen.queryByText("save-draft")).toBeNull());
  });

  it("supports stay/proceed and registers dirty browser-unload protection", () => {
    state.blocker.state = "blocked";
    render(<EmailTemplatesEditor overview={overview()} canWrite onSaved={vi.fn()} />);
    changeSubject("Changed");
    fireEvent.click(screen.getByText("stay-page"));
    expect(state.blocker.reset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("leave-page"));
    expect(state.blocker.proceed).toHaveBeenCalledTimes(1);
    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;
    state.beforeUnload?.(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("switches locale and resets a modified template to its locale default", () => {
    render(<EmailTemplatesEditor overview={overview()} canWrite onSaved={vi.fn()} />);
    changeSubject("Changed");
    fireEvent.click(screen.getByText("settings.emailTemplates.resetTemplate"));
    expect((screen.getByTestId("email-template-field-subject") as HTMLInputElement).value).toBe(
      "Default BS",
    );
    fireEvent.click(screen.getByRole("radio", { name: "settings.emailTemplates.locales.en" }));
    expect((screen.getByTestId("email-template-field-subject") as HTMLInputElement).value).toBe(
      "Initial EN",
    );
  });
});
