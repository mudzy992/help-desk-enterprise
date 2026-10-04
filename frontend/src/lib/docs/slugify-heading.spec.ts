import { describe, expect, it } from "vitest";
import { slugifyHeading } from "./slugify-heading";

describe("slugifyHeading (Faza 3 c)", () => {
  it("svodi dijakritiku na ASCII i spaja riječi crticom", () => {
    expect(slugifyHeading("Česta pitanja i greške")).toBe("cesta-pitanja-i-greske");
    expect(slugifyHeading("Uloge i dozvole")).toBe("uloge-i-dozvole");
    expect(slugifyHeading("Đački dnevnik")).toBe("dacki-dnevnik");
  });

  it("uklanja interpunkciju i vodi/završne crtice", () => {
    expect(slugifyHeading("Polja, validacije i statusi")).toBe("polja-validacije-i-statusi");
    expect(slugifyHeading("  Kako doći?  ")).toBe("kako-doci");
    expect(slugifyHeading("A/B — C")).toBe("a-b-c");
  });

  it("daje isti rezultat kao generator ogledala (bez velikih slova i dijakritike)", () => {
    expect(slugifyHeading("Poznata ograničenja")).toBe("poznata-ogranicenja");
    expect(slugifyHeading("")).toBe("");
  });
});
