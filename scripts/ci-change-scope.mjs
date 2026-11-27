/*
  Decides what a pull request has to run.

  Until 2026-11-27 the answer came from `git diff origin/<base> HEAD`, i.e. the
  whole PR. That is correct for the *first* run of a PR and wrong for every later
  one: a documentation commit on top of an already-tested PR still reported
  `code=true`, so backend, frontend, container, integration and the browser gate
  ran again for a two-file docs change (run 46064203121: 45 min of jobs for
  `EXECUTION-PLAN-REMAINING.md` + one closeout).

  The rule now:

  * the code jobs run when the PR diff contains code **and** something changed
    since the last pull-request run of this PR that concluded successfully;
  * they are skipped only when every file changed since that green run is
    documentation — the code subtree is then byte-for-byte the tree that already
    passed;
  * anything the script cannot establish (unknown base, no green run, API
    failure) runs everything.

  Skipping never hides a missing check: `CI gate` is the required status check
  and it stays `always()`; the summary table names the reason.
*/
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSmokeSpecs, selectE2eSpecs } from './e2e-spec-selection.mjs';

/** Paths that also change product behaviour when they change. */
const findingsRegisterPatterns = [
  /^docs\/backend\/BACKEND-FINDINGS-REGISTER\.md$/,
  /^docs\/backend\/backend-findings-plan\.json$/,
  /^docs\/backend\/audits\//,
];
const docsPattern = /^(docs\/|\.cursor\/|perf\/results\/)|\.md$/;

/**
 * Classifies one path the same way the job always did:
 * `code` = it can change behaviour, `docs` = it is documentation.
 */
export function classifyPath(file) {
  if (findingsRegisterPatterns.some((pattern) => pattern.test(file))) {
    return { code: true, docs: true };
  }
  if (docsPattern.test(file)) return { code: false, docs: true };
  return { code: true, docs: false };
}

/** @returns {{code: boolean, docs: boolean}} */
export function classifyFiles(files) {
  let code = false;
  let docs = false;
  for (const file of files) {
    const classified = classifyPath(file.replace(/\\/g, '/'));
    code = code || classified.code;
    docs = docs || classified.docs;
  }
  return { code, docs };
}

/**
 * @param {object} input
 * @param {readonly string[] | null} input.files        Files in the PR diff, `null` when the base is unknown.
 * @param {readonly string[] | null} input.deltaFiles   Files changed since the last green run, `null` when unknown.
 * @param {string} input.previousGreenSha               Head of the last successful PR run, `''` when there is none.
 * @param {string} [input.headSha]                      The head being tested (to avoid trusting a stale green run).
 */
export function resolveScope({ files, deltaFiles, previousGreenSha, headSha = '' }) {
  if (files === null) {
    return {
      code: true,
      docs: true,
      specs: defaultSmokeSpecs,
      specsFallback: true,
      specsReason: 'unknown diff → full smoke set',
      scope: 'all',
      reason: 'could not diff the pull request — running every job',
      previousGreenSha: '',
    };
  }

  const full = classifyFiles(files);
  if (!full.code) {
    return {
      code: false,
      docs: full.docs,
      specs: [],
      specsFallback: false,
      specsReason: 'documentation only',
      scope: 'docs-only',
      reason: 'the pull request changes documentation only',
      previousGreenSha: '',
    };
  }

  const green = previousGreenSha.trim();
  const greenIsUsable = green !== '' && green !== headSha && deltaFiles !== null;
  if (greenIsUsable) {
    const delta = classifyFiles(deltaFiles);
    if (!delta.code) {
      return {
        code: false,
        docs: true,
        specs: [],
        specsFallback: false,
        specsReason: 'code unchanged since the last green run',
        scope: 'code-unchanged',
        reason:
          `every file changed since ${green.slice(0, 8)} (green) is documentation — ` +
          'the code tree already passed this workflow',
        previousGreenSha: green,
      };
    }
  }

  const effective = greenIsUsable ? deltaFiles : files;
  const selection = selectE2eSpecs(effective);
  return {
    code: true,
    docs: full.docs,
    specs: selection.specs,
    specsFallback: selection.fallback,
    specsReason: selection.reason,
    scope: greenIsUsable ? 'code-changed-since-green' : 'code',
    reason: greenIsUsable
      ? `code changed since ${green.slice(0, 8)} — specs chosen from that delta`
      : 'code changed — specs chosen from the pull-request diff',
    previousGreenSha: greenIsUsable ? green : '',
  };
}

function gitDiffFiles(base, head) {
  try {
    const output = execFileSync('git', ['diff', '--name-only', base, head], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  } catch {
    return null;
  }
}

function gitRefIsResolvable(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function readArgument(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return argv[index + 1] ?? '';
}

function main(argv) {
  const base = readArgument(argv, 'base');
  const head = readArgument(argv, 'head') || 'HEAD';
  const previousGreenSha = readArgument(argv, 'previous-green');

  const files =
    base !== '' && gitRefIsResolvable(base) ? gitDiffFiles(base, head) : null;
  // The delta is measured between two commits of the branch, not against the
  // merge ref: a base branch that moved meanwhile must not look like a change
  // this pull request made.
  const deltaHead = readArgument(argv, 'head-sha') || head;
  const deltaFiles =
    previousGreenSha !== '' && gitRefIsResolvable(previousGreenSha)
      ? gitDiffFiles(previousGreenSha, deltaHead)
      : null;

  const scope = resolveScope({
    files,
    deltaFiles,
    previousGreenSha,
    headSha: readArgument(argv, 'head-sha'),
  });

  const lines = [
    `code=${scope.code}`,
    `docs=${scope.docs}`,
    `e2e_specs=${scope.specs.join(',')}`,
    `e2e_specs_fallback=${scope.specsFallback}`,
    `e2e_specs_reason=${scope.specsReason}`,
    `scope=${scope.scope}`,
    `scope_reason=${scope.reason}`,
    `previous_green=${scope.previousGreenSha}`,
  ];
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath !== undefined && outputPath !== '') {
    appendFileSync(outputPath, `${lines.join('\n')}\n`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  if (files !== null) {
    process.stdout.write(`--- changed files (${files.length}) ---\n${files.join('\n')}\n`);
  }
  if (deltaFiles !== null) {
    process.stdout.write(`--- since green (${deltaFiles.length}) ---\n${deltaFiles.join('\n')}\n`);
  }
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv));
}
