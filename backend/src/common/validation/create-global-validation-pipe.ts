import { ValidationPipe } from '@nestjs/common';

/**
 * Review 2026-09-25 (N6): validation was configured per controller, so a new
 * controller without `@UsePipes` accepted any body. The same options now apply
 * globally (per-controller pipes remain and are equivalent). Plain-typed
 * parameters (`string`, `Record<…>`) are not class-validated by design.
 */
export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}
