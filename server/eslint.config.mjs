// ESLint flat config（ESLint 9）
// 规则：TypeScript 推荐 + 自定义（禁 console、未使用变量报错等）
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // 业务代码禁止裸 console；日志统一走 src/logger.ts
      'no-console': 'error',
      // 未使用变量视为错误（tsc noUnusedLocals 已开启，双保险）
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 演示项目允许显式 any，便于渐进完善
      '@typescript-eslint/no-explicit-any': 'off',
      // 扩展 Express Request 类型的标准写法（declare global namespace Express）
      '@typescript-eslint/no-namespace': 'off',
    },
  },
  {
    // logger.ts 是唯一允许使用 console 的封装层
    files: ['src/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  }
);
