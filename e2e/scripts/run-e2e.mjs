/*
  Nightly run 44049572740 (2026-11-17): the stack went away in the middle of the
  full suite. `GET /health` had answered 200 in the Preflight ten minutes earlier,
  so the job started normally — and then the reverse proxy began answering its own
  HTML page ("Site not available", HTTP 503) to *both* the API and the app. Playwright
  kept walking the remaining spec files, each one burning its retries and its 90 s
  timeout, and the run ended 47 minutes later with 18 red tests that describe the
  outage, not the product. The only readable trace was a 62 KB failure summary.

  This wrapper runs `playwright test` as a child process while probing
  `$E2E_API_URL/health` in the background. After `E2E_STACK_FAILURES_TO_ABORT`
  consecutive failed probes (default 4 × 15 s ≈ 45 s of downtime — a rolling
  restart usually heals well inside that) it stops the run, prints a workflow
  annotation that names the outage, and writes `stack-watch.json`:

    { startedAt, finishedAt, apiUrl, aborted, threshold, intervalMs,
      outage: { firstAt, lastAt, durationMs, recovered } | null,
      probes: [ { at, ok, httpStatus, proxyPage, title, error } … ] }

  The file is uploaded with the report, so the outage *window* can be matched
  against the hosting layer's deploy/restart history. `E2E_STACK_WATCHDOG=off`
  turns the watchdog off (a local run against a machine that is still booting).

  Exit code: the child's exit code, or 1 when the probe aborted the run. A red
  job is still red — the wrapper only makes an infrastructure failure say so.
*/

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

const MAX_PROBES_KEPT = 60;

/** The hosting layer's HTML error page, not one of our JSON answers. */
export function pageTitle(text) {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(text ?? '');
  return match === null ? null : match[1].trim();
}

export function looksLikeProxyPage(text) {
  return (text ?? '').trimStart().startsWith('<');
}

/** One line for the log: what the probe saw, in the operator's terms. */
export function describeProbe(result) {
  if (result.httpStatus === null) {
    return `network error (${result.error ?? 'unknown'})`;
  }
  const proxy = result.proxyPage ? `, proxy page "${result.title ?? 'untitled'}"` : '';
  return `HTTP ${result.httpStatus}${proxy}`;
}

export function createState({ apiUrl, threshold, intervalMs, now = () => new Date().toISOString() }) {
  return {
    startedAt: now(),
    finishedAt: null,
    apiUrl,
    aborted: false,
    threshold,
    intervalMs,
    consecutiveFailures: 0,
    outage: null,
    probes: [],
  };
}

/**
 * Fold one probe into the state: keeps the last `MAX_PROBES_KEPT` probes, opens
 * or extends the outage window and counts consecutive failures. Returns `true`
 * exactly once per outage — the probe that reaches the threshold, i.e. the one
 * that aborts the run.
 */
export function registerProbe(state, result, threshold = state.threshold) {
  state.probes.push(result);
  if (state.probes.length > MAX_PROBES_KEPT) state.probes.shift();

  if (result.ok) {
    if (state.consecutiveFailures > 0) {
      state.consecutiveFailures = 0;
      if (state.outage !== null) state.outage.recovered = true;
    }
    return false;
  }

  state.consecutiveFailures += 1;
  if (state.outage === null) {
    state.outage = { firstAt: result.at, lastAt: result.at, durationMs: 0, recovered: false };
  } else {
    state.outage.lastAt = result.at;
    state.outage.durationMs = Date.parse(result.at) - Date.parse(state.outage.firstAt);
    state.outage.recovered = false;
  }
  return state.consecutiveFailures === threshold;
}

function readNumber(name, fallback, minimum) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function playwrightCli() {
  const candidates = [
    path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
    path.join(projectRoot, 'node_modules', 'playwright', 'cli.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function probe(apiUrl, timeoutMs) {
  const at = new Date().toISOString();
  try {
    const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }
    let health = null;
    try {
      health = JSON.parse(body)?.status ?? null;
    } catch {
      health = null;
    }
    return {
      at,
      ok: response.ok && health === 'ok',
      httpStatus: response.status,
      proxyPage: looksLikeProxyPage(body),
      title: pageTitle(body),
      error: null,
    };
  } catch (error) {
    const cause = error?.cause;
    return {
      at,
      ok: false,
      httpStatus: null,
      proxyPage: false,
      title: null,
      error: String(cause?.code ?? cause?.message ?? error?.message ?? error),
    };
  }
}

function writeReport(reportPath, state) {
  try {
    writeFileSync(reportPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.log(`[e2e] could not write ${reportPath}: ${String(error)}`);
  }
}

function killTree(child, signal) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }
  try {
    // The child leads its own process group (`detached`), so the signal reaches
    // Playwright *and* its workers — a stopped run must not leave a Chromium behind.
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function spawnPlaywright(args) {
  const cli = playwrightCli();
  if (cli === null) {
    console.log('[e2e] @playwright/test is not installed — run `npm ci` in e2e/.');
    return null;
  }
  return spawn(process.execPath, [cli, 'test', ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve(code ?? (signal === null ? 1 : 1)));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const probeIntervalMs = readNumber('E2E_STACK_PROBE_INTERVAL_MS', 15_000, 1_000);
  const probeTimeoutMs = readNumber('E2E_STACK_PROBE_TIMEOUT_MS', 10_000, 1_000);
  const failuresToAbort = readNumber('E2E_STACK_FAILURES_TO_ABORT', 4, 1);
  const killGraceMs = readNumber('E2E_STACK_KILL_GRACE_MS', 20_000, 1_000);
  const watchdogEnabled = (process.env.E2E_STACK_WATCHDOG ?? 'on').trim().toLowerCase() !== 'off';
  const reportPath =
    process.env.E2E_STACK_WATCH_FILE?.trim() || path.join(projectRoot, 'stack-watch.json');
  const apiUrl = (process.env.E2E_API_URL ?? '').trim().replace(/\/+$/, '');

  if (!watchdogEnabled || apiUrl === '') {
    console.log(
      `[e2e] stack watchdog off (${watchdogEnabled ? 'E2E_API_URL is empty' : 'E2E_STACK_WATCHDOG=off'}) — running Playwright unchanged.`,
    );
    const plain = spawnPlaywright(args);
    return plain === null ? 1 : await waitForExit(plain);
  }

  const child = spawnPlaywright(args);
  if (child === null) return 1;

  const state = createState({
    apiUrl,
    threshold: failuresToAbort,
    intervalMs: probeIntervalMs,
  });
  let armed = true;

  const note = async () => {
    if (!armed || child.exitCode !== null) return;
    const result = await probe(apiUrl, probeTimeoutMs);
    const recovered = result.ok && state.consecutiveFailures > 0;
    const trip = registerProbe(state, result, failuresToAbort);

    if (recovered) {
      console.log(`[e2e] GET ${apiUrl}/health answers again — the outage is over.`);
      return;
    }
    if (result.ok) return;

    if (state.consecutiveFailures === 1) {
      console.log(
        `::warning title=E2E stack probe failed::GET ${apiUrl}/health -> ${describeProbe(result)}. Watching: the run continues until ${failuresToAbort} consecutive failures.`,
      );
      return;
    }
    if (!trip) {
      console.log(
        `[e2e] probe failed again (${state.consecutiveFailures}/${failuresToAbort}): ${describeProbe(result)}.`,
      );
      return;
    }

    console.log(
      `::error title=E2E stack unavailable (infrastructure, not a code regression)::GET ${apiUrl}/health failed ${state.consecutiveFailures} times since ${state.outage?.firstAt} (${describeProbe(result)}). The hosting layer answered instead of the application, so the rest of this run would describe the outage, not the product. Stopping Playwright. Check the deploy/restart history of the stack for ${state.outage?.firstAt}–${state.outage?.lastAt}, then re-run: Actions -> CI -> Run workflow (specs from the failure summary).`,
    );
    armed = false;
    state.aborted = true;
    state.finishedAt = new Date().toISOString();
    writeReport(reportPath, state);
    killTree(child, 'SIGTERM');
    setTimeout(() => killTree(child, 'SIGKILL'), killGraceMs).unref();
  };

  const timer = setInterval(() => {
    void note();
  }, probeIntervalMs);
  timer.unref?.();

  const forward = (signal) => {
    armed = false;
    killTree(child, signal);
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  const code = await waitForExit(child);
  armed = false;
  clearInterval(timer);

  // One last look, so the report says whether the stack came back before the job
  // ended — a transient restart and a stack that is still down need different
  // follow-ups from whoever reads the job.
  if (state.outage !== null) {
    registerProbe(state, await probe(apiUrl, probeTimeoutMs), failuresToAbort);
  }

  state.finishedAt = new Date().toISOString();
  writeReport(reportPath, state);

  if (state.aborted) {
    console.log(
      `[e2e] stopped by the stack watchdog after ${state.outage?.durationMs ?? 0} ms without a healthy API; the timeline is in ${path.basename(reportPath)}.`,
    );
    return code === 0 ? 1 : code;
  }
  return code;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(
        `[e2e] run-e2e wrapper failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      process.exit(1);
    },
  );
}
