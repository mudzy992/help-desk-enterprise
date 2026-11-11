// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnCallRangeDialog } from "@/components/on-call/on-call-range-dialog";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("OnCallRangeDialog zone (O4)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the override window on the schedule's wall clock, not the browser's", () => {
    render(
      <ToastProvider>
        <OnCallRangeDialog
          open
          onOpenChange={vi.fn()}
          mode="override"
          groupId="group-1"
          groupName="Podrška"
          timeZone="Europe/Sarajevo"
          people={[]}
          initialRange={{
            startsAt: "2026-10-13T06:00:00.000Z",
            endsAt: "2026-10-14T06:00:00.000Z",
          }}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

    const [from, to] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'),
    );
    expect(from?.value).toBe("2026-10-13T08:00");
    expect(to?.value).toBe("2026-10-14T08:00");
    expect(document.body.textContent).toContain("onCall.zoneHint");
  });
});
