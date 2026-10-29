// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { UnderlineTabs } from "@/components/ui/tabs";
import { WizardStepper } from "@/components/ui/wizard-stepper";

function TabsFixture() {
  const [active, setActive] = useState("one");
  return (
    <UnderlineTabs
      label="Sections"
      items={[
        { key: "one", label: "One", panelId: "panel-one" },
        { key: "two", label: "Two" },
        { key: "three", label: "Three" },
      ]}
      active={active}
      onChange={setActive}
    />
  );
}

function SegmentedFixture() {
  const [value, setValue] = useState("a");
  return (
    <Segmented
      label="View"
      items={[
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

describe("selection and progress semantics", () => {
  it("uses roving focus and keyboard selection for tabs", () => {
    render(<TabsFixture />);
    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    expect(one.getAttribute("tabindex")).toBe("0");
    expect(two.getAttribute("tabindex")).toBe("-1");
    expect(one.getAttribute("aria-controls")).toBe("panel-one");
    fireEvent.keyDown(one, { key: "ArrowRight" });
    expect(document.activeElement).toBe(two);
    expect(two.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(two, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Three" }));
  });

  it("uses roving focus and keyboard selection for segmented radios", () => {
    render(<SegmentedFixture />);
    const a = screen.getByRole("radio", { name: "A" });
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    const c = screen.getByRole("radio", { name: "C" });
    expect(document.activeElement).toBe(c);
    expect(c.getAttribute("aria-checked")).toBe("true");
  });

  it("exposes clamped progress and the current wizard step", () => {
    render(
      <>
        <Progress value={140} label="Upload" />
        <WizardStepper
          label="Setup"
          activeIndex={1}
          steps={[
            { key: "first", label: "First" },
            { key: "second", label: "Second" },
          ]}
        />
      </>,
    );
    expect(screen.getByRole("progressbar", { name: "Upload" }).getAttribute("aria-valuenow")).toBe(
      "100",
    );
    expect(screen.getByText("Second").closest("li")?.getAttribute("aria-current")).toBe("step");
  });
});
