// Review 2026-09-25: `npm run lint` failed because there was no flat config.
// Baseline: ESLint + typescript-eslint recommended (syntax-only, fast). Rules
// with many existing hits are warnings so lint can gate CI without a big-bang
// rewrite; tighten them over time.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**', 'coverage/**', 'prisma/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' } },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
