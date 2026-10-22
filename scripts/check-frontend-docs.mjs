#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const frontendDocsRoot = path.join(repositoryRoot, "docs", "frontend");
const markdownFiles = [];
const failures = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (entry.name.endsWith(".md")) markdownFiles.push(target);
  }
}

function resolveLink(file, href) {
  const target = href.split("#", 1)[0];
  if (target === "") return null;
  const decoded = decodeURIComponent(target);
  return path.resolve(path.dirname(file), decoded);
}

collect(frontendDocsRoot);

for (const file of markdownFiles) {
  const content = readFileSync(file, "utf8");
  const relative = path.relative(repositoryRoot, file);
  if (!/^(?:- )?\*\*Status(?: implementacije)?:\*\*\s+.+$/m.test(content)) {
    failures.push(`${relative}: nema Status`);
  }
  if (
    !/^(?:- )?\*\*(Ažurirano|Datum[^:]*):\*\*\s+(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}\.)/m.test(
      content,
    )
  ) {
    failures.push(`${relative}: nema datum`);
  }
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1].trim();
    if (/^(https?:|mailto:|\/)/.test(href)) continue;
    const target = resolveLink(file, href);
    if (
      target !== null &&
      (!existsSync(target) || statSync(target).isDirectory())
    ) {
      failures.push(`${relative}: mrtav link ${href}`);
    }
  }
}

const officialMarkers = markdownFiles.filter((file) =>
  /^# Aktuelni zvanični frontend audit$/m.test(readFileSync(file, "utf8")),
);
if (officialMarkers.length !== 1) {
  failures.push(
    `očekivan je jedan aktuelni audit indeks, pronađeno ${officialMarkers.length}`,
  );
}

const whatsNew = readFileSync(
  path.join(repositoryRoot, "docs", "user-guide", "sta-je-novo.md"),
  "utf8",
);
for (const match of whatsNew.matchAll(/^\|\s*([^|]+)\s*\|/gm)) {
  const value = match[1].trim();
  if (value === "Datum" || value.startsWith("---")) continue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    failures.push(`Šta je novo: datum nije ISO — ${value}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `✓ frontend docs: ${markdownFiles.length} dokumenata, linkovi/statusi/datumi uredni`,
  );
}
