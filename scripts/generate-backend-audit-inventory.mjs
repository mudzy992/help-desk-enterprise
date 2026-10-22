import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const modulesRoot = path.join(root, "backend/src/modules");
const output = path.join(root, "docs/backend/backend-module-inventory.json");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : target;
    }),
  );
  return nested.flat();
}

const moduleNames = (await readdir(modulesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const inventory = [];
for (const moduleName of moduleNames) {
  const directory = path.join(modulesRoot, moduleName);
  const files = (await walk(directory)).filter((file) => file.endsWith(".ts"));
  const specFiles = files.filter((file) => file.endsWith(".spec.ts"));
  const productionFiles = files.filter((file) => !file.endsWith(".spec.ts"));
  let productionLoc = 0;
  const dependencies = new Set();

  for (const file of productionFiles) {
    const source = await readFile(file, "utf8");
    productionLoc += source.split(/\r?\n/u).length;
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
      const importPath = match[1];
      if (!importPath.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(file), importPath);
      const relative = path.relative(modulesRoot, resolved);
      if (relative.startsWith("..")) continue;
      const dependency = relative.split(path.sep)[0];
      if (moduleNames.includes(dependency) && dependency !== moduleName)
        dependencies.add(dependency);
    }
  }

  inventory.push({
    module: moduleName,
    typescriptFiles: files.length,
    productionFiles: productionFiles.length,
    specFiles: specFiles.length,
    productionLoc,
    controllers: productionFiles.filter((file) =>
      file.endsWith(".controller.ts"),
    ).length,
    services: productionFiles.filter((file) => file.endsWith(".service.ts"))
      .length,
    moduleDependencies: [...dependencies].sort(),
  });
}

const serialized = JSON.stringify(
  {
    schemaVersion: 1,
    generatedFrom: "backend/src/modules",
    generatedAt: "2026-10-22",
    modules: inventory,
  },
  null,
  2,
).replace(
  /      "moduleDependencies": \[\n([\s\S]*?)\n      \]/gu,
  (block, entries) => {
    const values = entries
      .split("\n")
      .map((line) => line.trim().replace(/,$/u, ""))
      .filter(Boolean);
    const inline = `      "moduleDependencies": [${values.join(", ")}]`;
    return inline.length <= 80 ? inline : block;
  },
);

await writeFile(output, `${serialized}\n`);
console.log(
  `✓ backend audit inventory: ${inventory.length} modules -> ${path.relative(root, output)}`,
);
