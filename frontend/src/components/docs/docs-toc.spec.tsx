// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocsToc } from "@/components/docs/docs-toc";

describe("DocsToc", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("navigira na naslov jednim klikom bez router remounta stranice", () => {
    const heading = document.createElement("h2");
    heading.id = "poznata-ogranicenja";
    document.body.append(heading);
    const scrollIntoView = vi.fn();
    heading.scrollIntoView = scrollIntoView;

    render(
      <DocsToc toc={[{ id: "poznata-ogranicenja", level: 2, text: "Poznata ograničenja" }]} />,
    );

    const link = screen.getByRole("link", { name: "Poznata ograničenja" });
    fireEvent.click(link);

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(window.location.hash).toBe("#poznata-ogranicenja");
    expect(link.getAttribute("aria-current")).toBe("location");
  });
});
