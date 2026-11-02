import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  {
    ignores: ['data', 'dist', 'node_modules', '.resources', '.docs'],
  },

  eslint.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs}'],

    languageOptions: {
      ecmaVersion: 'latest',
    },

    plugins: {
      import: importPlugin,
    },

    settings: {
      'import/resolver': {
        node: { extensions: ['.js', '.mjs', '.cjs', '.json'] },
      },
    },

    rules: {
      ...importPlugin.configs.recommended.rules,

      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',

      'no-console': 'off',
      'default-case': 'warn',
      'no-empty': 'warn',

      'import/no-cycle': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  {
    files: ['*.{js,mjs}', 'src/main.js', 'test/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },

  {
    files: ['src/frontend/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
];
