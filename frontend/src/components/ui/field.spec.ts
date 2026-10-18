import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Field, Input, type FieldControlProps } from "./field";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderInput = (control: FieldControlProps) => createElement(Input, control);

describe("Field (2.8 §3.2)", () => {
  it("links label, hint and error to the control in the render-function form", () => {
    const html = renderToStaticMarkup(
      createElement(Field, {
        id: "title",
        label: "Naslov",
        required: true,
        hint: "Kratko",
        error: "Obavezno polje",
        children: renderInput,
      }),
    );
    expect(html).toContain('for="title"');
    expect(html).toContain('id="title"');
    expect(html).toContain('aria-describedby="title-hint title-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('aria-hidden="true">*</span>');
    expect(html).not.toContain("a11y.requiredField");
  });

  it("omits error wiring when valid", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { id: "x", label: "X", children: renderInput }),
    );
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
  });

  it("generates one id shared by the label and control", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { label: "Naslov", children: renderInput }),
    );
    const controlId = html.match(/<label for="([^"]+)"/)?.[1];
    expect(controlId).toBeTruthy();
    expect(html).toContain(`id="${controlId}"`);
  });
});
