import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'docs/design/**', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { plugins: { '@nx': nx } },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: [],
          depConstraints: [
            { sourceTag: 'type:web', onlyDependOnLibsWithTags: ['type:shared'] },
            { sourceTag: 'type:api', onlyDependOnLibsWithTags: ['type:shared'] },
            { sourceTag: 'type:shared', onlyDependOnLibsWithTags: [] },
          ],
        },
      ],
    },
  },
  prettier,
);
