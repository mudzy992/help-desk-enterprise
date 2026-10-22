// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "@/components/privacy/markdown-view";

describe("MarkdownView table navigation", () => {
  it("prikazuje navigaciju neposredno iznad i ispod prve tabele", () => {
    const { container } = render(
      <MarkdownView
        renderTableNavigation={() => <nav data-testid="table-navigation">Navigacija</nav>}
        source={`Uvod prije tabele.

| Datum | Izmjena |
|---|---|
| 2026-10-22 | Novo |

Tekst poslije tabele.`}
      />,
    );

    const children = [...(container.firstElementChild?.children ?? [])];
    expect(children.map((child) => child.tagName)).toEqual(["P", "NAV", "DIV", "NAV", "P"]);
    expect(container.querySelectorAll('[data-testid="table-navigation"]')).toHaveLength(2);
  });
});
