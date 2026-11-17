import { readE2EEnvironment } from './environment';

/**
 * Wait until the API behind `$E2E_API_URL` answers `/health` with `{"status":"ok"}`.
 *
 * Nightly run 44049572740 (2026-11-17) started while the stack was healthy, so
 * this wait was never the weak point; a manual dispatch during a redeploy is.
 * The budget is therefore 120 s (`E2E_STACK_WAIT_MS`) and the failure names what
 * the proxy answered — the HTML page ("Site not available") of the hosting layer
 * is not a slow API, it is an application that is not running.
 */
export async function waitForStack(timeoutMs = readBudgetMs()): Promise<void> {
  const { apiUrl } = readE2EEnvironment();
  const started = Date.now();
  let lastError: unknown;
  let lastAnswer = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(10_000) });
      const body = await response.text();
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim();
      lastAnswer = title === undefined ? body.slice(0, 120) : `HTML page "${title}"`;
      if (response.ok) {
        try {
          if ((JSON.parse(body) as { status?: string }).status === 'ok') {
            return;
          }
        } catch {
          // Not ours: the proxy answered. Keep waiting, the message below says so.
        }
      }
      lastError = new Error(`health status ${response.status}${title === undefined ? '' : ` (${lastAnswer})`}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(
    `STACK_UNAVAILABLE: E2E stack not ready at ${apiUrl}/health after ${Math.round(timeoutMs / 1_000)}s: ` +
      `${String(lastError)}` +
      (lastAnswer.length > 0 ? `; last answer: ${lastAnswer}` : '') +
      ' — the application is not running behind the proxy, so nothing in this suite can be verified.',
  );
}

function readBudgetMs(): number {
  const raw = process.env.E2E_STACK_WAIT_MS?.trim();
  if (raw === undefined || raw === '') return 120_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}
