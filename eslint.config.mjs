// @ts-check
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Global ignores
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'templates/**',
      'rpi/**',
      '.ai-sdlc/**',
      '**/*.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // Allow `any` — this CLI codebase has ~220 intentional uses
      '@typescript-eslint/no-explicit-any': 'off',

      // Allow require() — a few intentional uses exist
      '@typescript-eslint/no-require-imports': 'off',

      // Unused vars: allow _ prefix, ignore rest siblings
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Consistent type imports — inline style preserves .js extensions
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],

      // Import sorting
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // Disable rules that are noisy on a CLI codebase and not auto-fixable at scale
      // no-console: CLI/TUI output is intentional (860+ uses)
      'no-console': 'off',

      // no-empty: too many intentional empty catch blocks in shutdown paths
      'no-empty': 'off',

      // no-case-declarations: common pattern in switch blocks
      'no-case-declarations': 'off',
    },
  },
);
