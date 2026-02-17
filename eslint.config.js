import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // `globals` packages vary; support both keys defensively.
        ...(globals.worker || globals.webworker || {}),
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log', 'debug'] }],
      // Security: prevent eval and implied eval (setTimeout/setInterval with strings)
      'no-eval': 'error',
      'no-implied-eval': 'error',
      // Correctness: require strict equality to avoid coercion bugs
      eqeqeq: ['warn', 'smart'],
      // Modern JS: prefer const for variables that are never reassigned
      'prefer-const': ['warn', { destructuring: 'all' }],
    },
  },
  {
    files: ['scripts/**/*.js', 'cli/**/*.js', 'tests/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'public/wasm/**'],
  },
];
