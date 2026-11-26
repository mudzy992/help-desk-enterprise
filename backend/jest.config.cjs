/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    ],
  },
  // The generated Prisma client imports its own files with a `.js` suffix (ESM style).
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
  // W2.20 (`BA-authentication-07`): generate the client when it is missing instead of
  // failing 24 suites on `Cannot find module '../../generated/prisma/client'`. Offline
  // safe — `generate` needs no schema engine binary.
  globalSetup: '<rootDir>/../scripts/jest-prisma-setup.cjs',
  reporters: ['default', '<rootDir>/../scripts/github-jest-reporter.cjs'],
};
