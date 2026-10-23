#!/usr/bin/env node
/* global console */
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const httpDecorators = new Set(["Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : target;
  }));
  return nested.flat();
}

function decorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(node) {
  const expression = node.expression;
  if (ts.isCallExpression(expression)) {
    const name = ts.isIdentifier(expression.expression) ? expression.expression.text : expression.expression.getText();
    return { name, arguments: expression.arguments.map((argument) => argument.getText()) };
  }
  return { name: expression.getText(), arguments: [] };
}

function stringArgument(argument) {
  if (argument === undefined) return "";
  if ((argument.startsWith("'") && argument.endsWith("'")) || (argument.startsWith('"') && argument.endsWith('"'))) {
    return argument.slice(1, -1);
  }
  return `{${argument}}`;
}

function guardNames(list) {
  const guard = list.map(decoratorCall).find((entry) => entry.name === "UseGuards");
  return guard?.arguments ?? [];
}

export function inspectControllerSource(source, file = "controller.ts") {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const routes = [];
  for (const statement of tree.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name === undefined) continue;
    const classDecorators = decorators(statement).map(decoratorCall);
    const controller = classDecorators.find((entry) => entry.name === "Controller");
    if (controller === undefined) continue;
    const prefix = stringArgument(controller.arguments[0]);
    const classGuards = guardNames(decorators(statement));
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || member.name === undefined) continue;
      const methodDecorators = decorators(member).map(decoratorCall);
      const http = methodDecorators.find((entry) => httpDecorators.has(entry.name));
      if (http === undefined) continue;
      const methodGuards = guardNames(decorators(member));
      const routePath = stringArgument(http.arguments[0]);
      const fullPath = `/${[prefix, routePath].filter(Boolean).join("/")}`.replace(/\/{2,}/gu, "/");
      routes.push({
        controller: statement.name.text,
        handler: member.name.getText(),
        method: http.name.toUpperCase(),
        path: fullPath,
        classGuards,
        methodGuards,
        guardBoundary: classGuards.length + methodGuards.length > 0 ? "explicit" : "inherited-or-public",
      });
    }
  }
  return routes;
}

function arrayProperty(object, name) {
  const property = object.properties.find(
    (entry) => ts.isPropertyAssignment(entry) && entry.name.getText().replace(/["']/gu, "") === name,
  );
  if (!property || !ts.isPropertyAssignment(property) || !ts.isArrayLiteralExpression(property.initializer)) return [];
  return property.initializer.elements.map((entry) => entry.getText());
}

export function inspectModuleSource(source, file = "module.ts") {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of tree.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name === undefined) continue;
    const moduleDecorator = decorators(statement).map(decoratorCall).find((entry) => entry.name === "Module");
    if (moduleDecorator === undefined) continue;
    const rawDecorator = decorators(statement).find((entry) => decoratorCall(entry).name === "Module");
    if (rawDecorator === undefined || !ts.isCallExpression(rawDecorator.expression)) continue;
    const metadata = rawDecorator.expression.arguments[0];
    if (!metadata || !ts.isObjectLiteralExpression(metadata)) continue;
    return {
      module: statement.name.text,
      imports: arrayProperty(metadata, "imports"),
      controllers: arrayProperty(metadata, "controllers"),
      providers: arrayProperty(metadata, "providers"),
      exports: arrayProperty(metadata, "exports"),
    };
  }
  throw new Error(`${file}: nije pronađen @Module class`);
}

export async function buildBackendWiringManifest(root) {
  const sourceRoot = path.join(root, "backend/src");
  const files = (await walk(sourceRoot))
    .filter((file) => file.endsWith(".controller.ts"))
    .sort();
  const routes = [];
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    for (const route of inspectControllerSource(await readFile(file, "utf8"), relative)) {
      routes.push({ source: relative, ...route });
    }
  }
  routes.sort((left, right) => `${left.path}:${left.method}:${left.handler}`.localeCompare(`${right.path}:${right.method}:${right.handler}`));

  const modules = [];
  for (const relative of ["backend/src/app.module.ts", "backend/src/worker.module.ts"]) {
    modules.push({ source: relative, ...inspectModuleSource(await readFile(path.join(root, relative), "utf8"), relative) });
  }
  return {
    schemaVersion: 1,
    generatedFrom: "backend/src/**/*.controller.ts + app.module.ts + worker.module.ts",
    controllerFiles: files.length,
    routeCount: routes.length,
    guardBoundaryCounts: routes.reduce((counts, route) => {
      counts[route.guardBoundary] = (counts[route.guardBoundary] ?? 0) + 1;
      return counts;
    }, {}),
    routes,
    modules,
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const output = path.join(root, "docs/backend/backend-wiring-manifest.json");
  const manifest = await buildBackendWiringManifest(root);
  if (manifest.routeCount === 0 || manifest.modules.length !== 2) throw new Error("wiring manifest je prazan ili nepotpun");
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    await writeFile(output, serialized);
    console.log(`✓ backend wiring manifest zapisan: ${manifest.controllerFiles} controllera, ${manifest.routeCount} ruta`);
    return;
  }
  try {
    if ((await stat(output)).size === 0 || (await readFile(output, "utf8")) !== serialized) {
      throw new Error("backend wiring manifest nije sinhronizovan; pokreni npm run wiring:write");
    }
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("backend wiring manifest nedostaje; pokreni npm run wiring:write");
    throw error;
  }
  console.log(
    `✓ backend wiring snapshot: ${manifest.controllerFiles} controllera, ${manifest.routeCount} ruta, ` +
      `explicit=${manifest.guardBoundaryCounts.explicit ?? 0}, inherited/public=${manifest.guardBoundaryCounts["inherited-or-public"] ?? 0}`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Backend wiring provjera: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
