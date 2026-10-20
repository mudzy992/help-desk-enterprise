// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  parseServiceCatalogUrl,
  updateServiceCatalogUrl,
} from "@/lib/services/service-catalog-url-state";

function Harness() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = parseServiceCatalogUrl(params);
  return (
    <>
      <output aria-label="query">{state.query}</output>
      <button
        type="button"
        onClick={() => setParams((current) => updateServiceCatalogUrl(current, { query: "mail" }))}
      >
        filter
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        forward
      </button>
    </>
  );
}

describe("service catalog URL history", () => {
  it("reproduces filters through Back and Forward navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/services?tab=owned"]}>
        <Harness />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "filter" }));
    expect(screen.getByLabelText("query").textContent).toBe("mail");

    fireEvent.click(screen.getByRole("button", { name: "back" }));
    await waitFor(() => expect(screen.getByLabelText("query").textContent).toBe(""));

    fireEvent.click(screen.getByRole("button", { name: "forward" }));
    await waitFor(() => expect(screen.getByLabelText("query").textContent).toBe("mail"));
  });
});
