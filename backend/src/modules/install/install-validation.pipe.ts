import { ValidationPipe } from '@nestjs/common';

/**
 * Install wizard v2 (F2): the wizard's two controllers share one pipe
 * configuration. `forbidNonWhitelisted` is what keeps a stale client from
 * posting fields the step no longer accepts (e.g. a body on `POST /install/seed`
 * that the pre-v2 wizard never sent).
 */
export function createInstallValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}
