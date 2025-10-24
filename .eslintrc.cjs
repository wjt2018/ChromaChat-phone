module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true
  },
  extends: [
    'eslint:recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  globals: {
    React: true,
    JSX: true
  },
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    'react-hooks/exhaustive-deps': 'warn'
  }
};
