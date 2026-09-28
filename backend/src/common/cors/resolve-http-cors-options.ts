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
    // Cross-origin deployments (frontend and API on different hosts) cannot
    // read the server-chosen download name otherwise; downloads then fall
    // back to client-side names.
    exposedHeaders: ['Content-Disposition'],
  };
}
