import { describe, expect, it } from "vitest";
import { paginateWhatsNewMarkdown } from "@/lib/docs/paginate-whats-new";

const source = `# Šta je novo

Uvod.

| Datum | Šta se promijenilo |
|---|---|
| 2026-10-22 | Prva |
| 2026-10-21 | Druga |
| 2026-10-20 | Treća |

## Povezani moduli

- Tiketi`;

describe("paginateWhatsNewMarkdown", () => {
  it("paginira datirane redove bez uklanjanja uvoda i završnih sekcija", () => {
    const result = paginateWhatsNewMarkdown(source, 2, 2);

    expect(result).toMatchObject({
      page: 2,
      totalItems: 3,
      totalPages: 2,
      firstItem: 3,
      lastItem: 3,
    });
    expect(result.markdown).toContain("# Šta je novo");
    expect(result.markdown).toContain("| 2026-10-20 | Treća |");
    expect(result.markdown).not.toContain("| 2026-10-22 | Prva |");
    expect(result.markdown).toContain("## Povezani moduli");
  });

  it("normalizuje nevažeću stranicu i čuva sadržaj bez changelog tabele", () => {
    expect(paginateWhatsNewMarkdown(source, 99, 2).page).toBe(2);
    expect(paginateWhatsNewMarkdown("# Bez tabele", Number.NaN).markdown).toBe("# Bez tabele");
  });
});
