// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Mail } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallFeatureCard } from "@/components/install/install-feature-card";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/*
  F3: the shared feature card. It is used by the package picker (F3), the add-ons
  step (F4), the Full sections (F5) and the final screen (F6), so its three states
  are pinned here: a working switch, a switch an unmet dependency disables, and the
  two read-only markers.
*/

afterEach(cleanup);

describe("InstallFeatureCard", () => {
  it("offers a switch and reports the change", () => {
    const onCheckedChange = vi.fn();
    render(
      <InstallFeatureCard
        icon={Mail}
        title="email"
        description="install.addons.emailHint"
        control="switch"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "email" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("disables the switch when a dependency is missing, and says why", () => {
    render(
      <InstallFeatureCard
        icon={Mail}
        title="email"
        control="switch"
        checked={false}
        disabledReason="install.addons.emailDisabledHint"
        onCheckedChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("switch", { name: "email" })).toHaveProperty("disabled", true);
    expect(screen.getByText("install.addons.emailDisabledHint")).toBeTruthy();
  });

  it("marks content the package requires and content it merely includes", () => {
    const { rerender } = render(<InstallFeatureCard icon={Mail} title="smtp" control="locked" />);
    expect(screen.getByText("install.feature.locked")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();

    rerender(<InstallFeatureCard icon={Mail} title="email" control="included" />);
    expect(screen.getByText("install.feature.included")).toBeTruthy();
  });

  it("shows the badges of a package line", () => {
    render(
      <InstallFeatureCard
        icon={Mail}
        title="inbound"
        badges={["install.feature.requiresSmtp", "install.feature.requiresDirectory"]}
      />,
    );

    expect(screen.getByText("install.feature.requiresSmtp")).toBeTruthy();
    expect(screen.getByText("install.feature.requiresDirectory")).toBeTruthy();
  });
});
