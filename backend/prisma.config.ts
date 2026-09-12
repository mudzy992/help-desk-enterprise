import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx ts-node --compiler-options {"module":"CommonJS","moduleResolution":"node","esModuleInterop":true} src/seed-database.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
