import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Paket 2.8 §5.1: axe scan with the project gate.
 *
 * - WCAG 2.0/2.1 A and AA rules;
 * - `serious` and `critical` violations fail the test;
 * - `moderate` and `minor` go to test-results/a11y-report.jsonl only;
 * - accepted findings live in e2e/a11y-exceptions.json with a reason.
 */
export type A11yException = {
  readonly rule: string;
  readonly selector: string;
  readonly reason: string;
  readonly reviewed: string;
};

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);
const REPORT = join(__dirname, '..', 'test-results', 'a11y-report.jsonl');

export function loadA11yExceptions(path = join(__dirname, '..', 'a11y-exceptions.json')): readonly A11yException[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { exceptions?: unknown };
  const list = Array.isArray(parsed.exceptions) ? parsed.exceptions : [];
  return list.map((entry, index) => {
    const item = entry as Partial<A11yException>;
    const problems = [
      typeof item.rule === 'string' && item.rule.length > 0 ? null : 'rule',
      typeof item.selector === 'string' && item.selector.length > 0 ? null : 'selector',
      typeof item.reason === 'string' && item.reason.trim().length >= 10 ? null : 'reason (min 10 chars)',
      typeof item.reviewed === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.reviewed) ? null : 'reviewed (YYYY-MM-DD)',
    ].filter((problem): problem is string => problem !== null);
    if (problems.length > 0) {
      throw new Error(`a11y-exceptions.json entry #${index} is missing: ${problems.join(', ')}`);
    }
    return item as A11yException;
  });
}

type Violation = {
  readonly id: string;
  readonly impact?: string | null;
  readonly help: string;
  readonly nodes: ReadonlyArray<{ readonly target: unknown[]; readonly failureSummary?: string }>;
};

function isExcepted(exceptions: readonly A11yException[], rule: string, target: string): boolean {
  return exceptions.some((item) => item.rule === rule && target.includes(item.selector));
}

export async function expectNoSeriousA11yViolations(
  page: Page,
  label: string,
  testInfo: TestInfo,
  options: { readonly exclude?: readonly string[] } = {},
): Promise<void> {
  const exceptions = loadA11yExceptions();
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  // Let running CSS transitions/animations settle first: a button that has just
  // become enabled fades from opacity 0.45 to 1 (transition-all 150 ms), and axe
  // measuring mid-fade reports a colour-contrast failure that no user sees.
  await page.evaluate(async () => {
    // Only finite ones: skeleton pulses and spinners never finish.
    const finite = document.getAnimations().filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
  const results = await builder.analyze();

  const blocking: string[] = [];
  const report: Array<Record<string, unknown>> = [];
  for (const violation of results.violations as Violation[]) {
    for (const node of violation.nodes) {
      const target = node.target.map(String).join(' ');
      if (isExcepted(exceptions, violation.id, target)) continue;
      const entry = { page: label, url: page.url(), rule: violation.id, impact: violation.impact ?? 'unknown', target, help: violation.help };
      report.push(entry);
      if (BLOCKING.has(violation.impact ?? '')) {
        blocking.push(`${violation.impact} ${violation.id} @ ${target} — ${violation.help}`);
      }
    }
  }
  mkdirSync(dirname(REPORT), { recursive: true });
  for (const entry of report) appendFileSync(REPORT, `${JSON.stringify(entry)}\n`);
  await testInfo.attach(`axe-${label}`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(blocking, `serious/critical axe findings on ${label}:\n${blocking.join('\n')}`).toEqual([]);
}

/** Forces the colour mode before the app boots (theme storage contract). */
export async function useColourMode(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ep-helpdesk.theme.mode', value);
  }, mode);
}
