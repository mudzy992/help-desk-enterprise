/*
  Which browser specs a pull request has to run.

  Until 2026-11-27 the PR gate always ran the same six files (`01,02,03,15,22,54`)
  no matter what changed: 12 runs and ~2 h of browser time across W2.29–W2.34,
  while every one of those packages touched RBAC code that none of the six specs
  exercises (`38-users-groups-rbac` was never in the set).

  This module maps a changed file to the specs that can actually observe it. The
  rules are deliberately narrow and the fallback is deliberately wide:

  * a file that matches no rule — or a run that would need more than
    `maxMappedSpecs` files — falls back to the full smoke set, so an unknown
    change can only cost time, never coverage;
  * `e2e/tests/<number>-*.spec.ts` selects exactly that spec, so editing a spec
    always runs it;
  * documentation selects nothing, because the caller only asks for specs when
    the diff contains code.
*/
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The PR smoke set used before path mapping existed; still the safe fallback. */
export const defaultSmokeSpecs = Object.freeze(['01', '02', '03', '15', '22', '54']);

/** More than this many mapped files is wider than the fallback, so the fallback is used. */
export const maxMappedSpecs = 4;

const docsPattern = /^(docs\/|\.cursor\/|perf\/results\/)|\.md$/;

/*
  Ordered: the first matching rule wins, so `tickets/approvals/` must come before
  `tickets/`.
*/
const rules = [
  { name: 'rbac', match: /^backend\/src\/modules\/rbac\//, specs: ['38', '01'] },
  { name: 'authorization', match: /^backend\/src\/modules\/authorization\//, specs: ['38', '01'] },
  { name: 'principal-context', match: /^backend\/src\/common\/principal-context\//, specs: ['38', '01'] },
  { name: 'ticket-approvals', match: /^backend\/src\/modules\/tickets\/approvals\//, specs: ['03'] },
  { name: 'tickets', match: /^backend\/src\/modules\/tickets\//, specs: ['01', '02', '15'] },
  { name: 'routing', match: /^backend\/src\/modules\/routing\//, specs: ['02'] },
  { name: 'notifications', match: /^backend\/src\/modules\/notifications\//, specs: ['36', '04'] },
  { name: 'authentication', match: /^backend\/src\/modules\/authentication\//, specs: ['37', '39'] },
  { name: 'announcements', match: /^backend\/src\/modules\/announcements\//, specs: ['45'] },
  { name: 'frontend-rbac', match: /^frontend\/src\/components\/rbac\//, specs: ['38'] },
  {
    name: 'frontend-shell',
    match: /^(frontend\/src\/layouts\/|frontend\/src\/components\/layout\/)/,
    specs: ['54', '22'],
  },
  { name: 'frontend-a11y', match: /^frontend\/src\/components\/a11y\//, specs: ['22'] },
  {
    name: 'frontend-dashboard',
    match: /^(frontend\/src\/components\/dashboard\/|frontend\/src\/pages\/dashboard-page\.)/,
    specs: ['54'],
  },
];

const specFilePattern = /^e2e\/tests\/(\d{2})-[^/]*\.spec\.ts$/;

function normalize(file) {
  return file.replace(/^\.\//, '').replace(/\\/g, '/');
}

/** Every spec number the rules can select (the guard test checks that each of them exists). */
export function mappedSpecNumbers() {
  const numbers = new Set();
  for (const rule of rules) for (const spec of rule.specs) numbers.add(spec);
  return numbers;
}

/** Every spec number that actually exists under `e2e/tests` (the guard test uses this too). */
export function existingSpecNumbers(rootDirectory) {
  const testsDirectory = path.join(rootDirectory, 'e2e', 'tests');
  const numbers = new Set();
  for (const entry of readdirSync(testsDirectory)) {
    const match = /^(\d{2})-[^/]*\.spec\.ts$/.exec(entry);
    if (match !== null) numbers.add(match[1]);
  }
  return numbers;
}

/**
 * Spec numbers for the given changed files.
 *
 * `files` is the list of paths the diff touched (repo-relative). Documents are
 * ignored: the caller runs the browser only when code changed.
 */
export function selectE2eSpecs(files) {
  const mapped = new Set();
  const reasons = [];
  let unmatchedCode = false;

  for (const raw of files) {
    const file = normalize(raw);
    if (file === '' || docsPattern.test(file)) continue;
    const specFile = specFilePattern.exec(file);
    if (specFile !== null) {
      mapped.add(specFile[1]);
      reasons.push(`e2e/tests/${specFile[1]}`);
      continue;
    }
    const rule = rules.find((candidate) => candidate.match.test(file));
    if (rule === undefined) {
      unmatchedCode = true;
      reasons.push(`unmatched:${file}`);
      continue;
    }
    for (const spec of rule.specs) mapped.add(spec);
    reasons.push(rule.name);
  }

  if (unmatchedCode) {
    const unmatched = files
      .map(normalize)
      .filter((file) => file !== '' && !docsPattern.test(file) && specFilePattern.exec(file) === null)
      .filter((file) => !rules.some((candidate) => candidate.match.test(file)));
    const shown = unmatched.slice(0, 3).join(', ');
    const more = unmatched.length > 3 ? ` +${unmatched.length - 3} more` : '';
    return {
      specs: defaultSmokeSpecs,
      fallback: true,
      reason: `unmatched code path → full smoke set (${shown}${more})`,
    };
  }
  const uniqueReasons = [...new Set(reasons)].join(', ');
  if (mapped.size === 0) {
    return {
      specs: defaultSmokeSpecs,
      fallback: true,
      reason: 'no mapped spec for this diff → full smoke set',
    };
  }
  if (mapped.size > maxMappedSpecs) {
    return {
      specs: defaultSmokeSpecs,
      fallback: true,
      reason: `${mapped.size} mapped specs (> ${maxMappedSpecs}) → full smoke set`,
    };
  }
  return {
    specs: [...mapped].sort((left, right) => left.localeCompare(right)),
    fallback: false,
    reason: `mapped by ${uniqueReasons}`,
  };
}

function main(argv) {
  const file = argv[2];
  if (file === undefined) {
    console.error('usage: node scripts/e2e-spec-selection.mjs <changed-files.txt>');
    return 2;
  }
  const files = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const selection = selectE2eSpecs(files);
  process.stdout.write(`specs=${selection.specs.join(',')}\n`);
  process.stdout.write(`fallback=${selection.fallback ? 'true' : 'false'}\n`);
  process.stdout.write(`reason=${selection.reason}\n`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv));
}
