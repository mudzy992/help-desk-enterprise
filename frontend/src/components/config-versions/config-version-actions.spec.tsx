// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigVersionActions } from "@/components/config-versions/config-version-actions";
import type { ConfigVersion } from "@/services/config-versions-types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const version: ConfigVersion = {
  id: "v-1",
  version: 7,
  status: "VALIDATED",
  releaseNotes: null,
  createdByUserId: null,
  activatedAt: null,
  createdAt: "2026-10-14T10:00:00.000Z",
  updatedAt: "2026-10-14T10:00:00.000Z",
  rollbackOfVersion: null,
};

describe("ConfigVersionActions", () => {
  it("requires an explicit confirmation before activation", () => {
    const onActivate = vi.fn();
    render(
      <ConfigVersionActions
        version={version}
        canWrite
        isBusy={false}
        shadowResult={{ sampleSize: 10, routingGroupMismatches: 1, slaRuleMismatches: 2 }}
        onValidate={vi.fn()}
        onActivate={onActivate}
        onRollback={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("configVersions.activateReason"), {
      target: { value: "approved change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "configVersions.activate" }));
    expect(onActivate).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onActivate).toHaveBeenCalledWith("approved change");
  });
});
