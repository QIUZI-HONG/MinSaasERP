# 贡献指南

感谢你愿意参与 MiniSaaS ERP 的完善。请遵守以下约定，保持项目质量一致。

## 开发环境

- Node.js ≥ 20（推荐使用 `.nvmrc` 指定的 24）
- 使用 `npm`（项目为 npm workspaces 结构，不要使用 yarn/pnpm 混用锁文件）

## 开发流程

```bash
npm install          # 安装全部 workspace 依赖
npm run dev          # 同时启动后端(3000)与前端(5173)
npm run lint         # 代码规范检查（提交前必须通过）
npm run typecheck    # TypeScript 类型检查
npm run build        # 构建产物
npm test             # 运行全部测试（不含 UI，见下）
```

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 格式：

```
<type>(<scope>): <subject>

# 示例
feat(orders): 增加订单导出功能
fix(auth): 修复登录失败时错误提示丢失
test(api): 补充订单金额篡改用例
docs: 更新部署文档
```

常用 type：`feat` / `fix` / `test` / `docs` / `chore` / `refactor` / `perf` / `style`

## 测试要求

- 新增接口必须补充对应测试用例（`tests/` 下按层组织）
- UI 层 E2E 依赖本机 Chrome，在本地执行：`npm run test:ui`（需先启动前后端）
- 提交前保证 `npm run lint` 与 `npm run typecheck` 零告警

## 环境变量

- 所有环境变量必须提供 `.env.example` 模板，实际值通过 `.env` 提供（不提交）
- 严禁在代码或提交信息中写入任何密钥

## 数据库变更

- 修改 `server/prisma/schema.prisma` 后执行 `npm run db:push` 同步本地库
- 变更需同步更新 Seed 数据（`server/prisma/seed.ts`），保证 `npm run db:seed` 可重复执行
