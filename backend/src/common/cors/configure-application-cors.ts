import type { INestApplication } from '@nestjs/common';
import { resolveHttpCorsOptions } from './resolve-http-cors-options';

export function configureApplicationCors(application: INestApplication): void {
  application.enableCors(resolveHttpCorsOptions());
}
