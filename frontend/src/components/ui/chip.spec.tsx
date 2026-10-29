// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Chip } from "@/components/ui/chip";

afterEach(cleanup);

describe("Chip actions", () => {
  it("uses the shared labelled remove control for a static chip", () => {
    const onRemove = vi.fn();
    render(
      <Chip onRemove={onRemove} removeLabel="Remove priority">
        Priority
      </Chip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove priority" }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps selection and removal as independent actions for an interactive chip", () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <Chip active onClick={onClick} onRemove={onRemove} removeLabel="Remove status">
        Open
      </Chip>,
    );

    const selection = screen.getByRole("button", { name: "Open" });
    expect(selection.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Remove status" }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(selection);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
