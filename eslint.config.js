// Flat ESLint config for the whole monorepo.
//
// One config, two environments: the backend is CommonJS running on Node, the
// frontend is ES modules running in the browser with React. Keeping them in one
// file means a single `npm run lint` covers everything and there is one place to
// change a rule.
//
// Rules are deliberately calibrated to be USEFUL rather than noisy: this is a
// working codebase, so the set below catches real defects (unused variables,
// accidental globals, unreachable code, `==` on null, promise mistakes) without
// flagging thousands of stylistic nits that would train everyone to ignore it.
// Formatting is Prettier's job, not ESLint's — hence eslint-config-prettier.

const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

/** Rules that apply everywhere, regardless of runtime. */
const sharedRules = {
  'no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none' // `catch (_)` / unused catch bindings are fine
    }
  ],
  'no-undef': 'error',
  'no-var': 'error',
  'prefer-const': 'warn',
  eqeqeq: ['warn', 'smart'],
  'no-implicit-coercion': 'off',
  'no-console': 'off', // the backend logger wraps console on purpose
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-return-await': 'warn',
  'require-await': 'off',
  'no-async-promise-executor': 'error',
  'no-await-in-loop': 'off' // sequential DB writes are intentional in places
};

module.exports = [
  {
    // Never lint build output, dependencies or generated bundles.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.min.js',
      'frontend/public/**',
      // Git worktrees live here (`.claude/worktrees/<name>`). Each one is a
      // full second copy of this repo with no node_modules of its own, so
      // walking it lints every file twice and then fails on plugins it cannot
      // resolve — turning `npm run verify` red for anyone who has a worktree
      // checked out, with errors that point at files nobody edited.
      '.claude/**'
    ]
  },

  // ---- Backend: Node + CommonJS -------------------------------------------
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...sharedRules
    }
  },

  // ---- Frontend: browser + ESM + React ------------------------------------
  {
    files: ['frontend/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,

      // The app uses the modern JSX transform — no `import React` required.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // no PropTypes in this codebase by choice
      'react/no-unescaped-entities': 'off',

      // These two catch REAL bugs:
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // ---- TypeScript ----------------------------------------------------------
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx']
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      ...sharedRules,

      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true }
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn'
    }
  },

  // ---- Root tooling files --------------------------------------------------
  {
    files: ['*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: { ...js.configs.recommended.rules, ...sharedRules }
  },

  // Prettier last: turns off every rule that would fight the formatter.
  prettier
];
