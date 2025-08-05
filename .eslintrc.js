module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
    browser: true,
    es2020: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/', 'node_modules/', '*.d.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-empty-function': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn',
    'eqeqeq': ['error', 'always'],
    'curly': 'error',
    'brace-style': ['error', '1tbs'],
    'comma-dangle': ['error', 'never'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'no-undef': 'off', // TypeScript handles this
    'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
  },
  overrides: [
    {
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
  ],
};