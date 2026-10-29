import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    // The generated client is TypeScript whose imports carry `.js` specifiers, which
    // ts-node cannot resolve (`Cannot find module './internal/class.js'`), so the seed runs
    // from the compiled output — the same way every `cli:*` script does. Build it first:
    // `npm run build` (the image does that before this file is ever used).
    seed: 'node dist/src/seed-database.js',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
