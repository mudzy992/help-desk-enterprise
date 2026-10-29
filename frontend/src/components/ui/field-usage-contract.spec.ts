import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type FieldViolation = {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
};

function productionTsxFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionTsxFiles(path);
    if (extname(entry.name) !== ".tsx" || entry.name.includes(".spec.")) return [];
    return [path];
  });
}

function meaningfulChildren(node: ts.JsxElement): readonly ts.JsxChild[] {
  return node.children.filter((child) => !ts.isJsxText(child) || child.text.trim().length > 0);
}

function inspectFieldUsages(path: string): readonly FieldViolation[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: FieldViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Field") {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const children = meaningfulChildren(node);
      const expression =
        children.length === 1 && ts.isJsxExpression(children[0])
          ? children[0].expression
          : undefined;
      if (expression === undefined || !ts.isArrowFunction(expression)) {
        violations.push({ path, line, reason: "Field must use one render-function child" });
      } else {
        const parameter = expression.parameters[0];
        const parameterName = parameter?.name.getText(source);
        let references = 0;
        const countReferences = (candidate: ts.Node): void => {
          if (
            parameterName !== undefined &&
            ts.isIdentifier(candidate) &&
            candidate.text === parameterName &&
            candidate !== parameter.name
          ) {
            references += 1;
          }
          ts.forEachChild(candidate, countReferences);
        };
        countReferences(expression.body);
        if (parameterName === undefined || references === 0) {
          violations.push({ path, line, reason: "Field control props must reach the control" });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

describe("Field usage contract", () => {
  it("wires every production Field through its typed control props", () => {
    const root = join(process.cwd(), "src");
    const violations = productionTsxFiles(root).flatMap(inspectFieldUsages);
    expect(violations).toEqual([]);
  });
});
