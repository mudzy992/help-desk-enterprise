import { resolveCorsOrigin } from './resolve-cors-origin';

export function resolveHttpCorsOptions(): {
  readonly origin: string | string[] | false;
  readonly credentials: false;
  readonly methods: readonly string[];
  readonly allowedHeaders: readonly string[];
  readonly exposedHeaders: readonly string[];
} {
  return {
    origin: resolveCorsOrigin(),
    credentials: false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-Install-Token'],
    // Cross-origin deployments need these response metadata headers exposed to
    // browser code (download names and paginated user totals).
    exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
  };
}
