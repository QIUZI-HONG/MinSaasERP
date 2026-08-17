// ESLint flat config（ESLint 9）：Vue 3 + TypeScript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Vue3 基础规则（flat/essential）
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      // 组件内允许 console.warn/error（调试提示保留），业务代码建议统一封装
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      // LoginView/DashboardView 等单文件命名是常见做法
      'vue/multi-word-component-names': 'off',
    },
  },
];
