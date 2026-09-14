import { resolveCorsOrigin } from './resolve-cors-origin';

export function resolveHttpCorsOptions(): {
  readonly origin: string | string[] | false;
  readonly credentials: false;
  readonly methods: readonly string[];
  readonly allowedHeaders: readonly string[];
} {
  return {
    origin: resolveCorsOrigin(),
    credentials: false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type'],
  };
}
