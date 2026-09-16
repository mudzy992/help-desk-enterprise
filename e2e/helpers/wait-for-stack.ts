import { readE2EEnvironment } from './environment';

export async function waitForStack(timeoutMs = 60_000): Promise<void> {
  const { apiUrl } = readE2EEnvironment();
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        const body = (await response.json()) as { status?: string };
        if (body.status === 'ok') {
          return;
        }
      }
      lastError = new Error(`health status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(
    `E2E stack not ready at ${apiUrl}/health: ${String(lastError)}`,
  );
}
