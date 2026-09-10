import type { INestApplicationContext } from '@nestjs/common';

export async function shutdownWorker(options: {
  readonly application: INestApplicationContext;
  readonly keepAliveTimer: ReturnType<typeof setInterval>;
}): Promise<void> {
  clearInterval(options.keepAliveTimer);
  await options.application.close();
}
