# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-08-17

### 新增

- 全栈 SaaS ERP 演示系统：登录鉴权（JWT）、商品/客户/订单管理、数据看板
- 订单核心链路：事务扣减库存、取消订单自动回补、状态机流转
- 四层质量测试套件：接口 56 例 / 安全 23 例 / Chrome E2E 21 例 / 并发 6 例（106/106 通过）

### 安全

- 严格入参校验（负价/零价/类型/长度）
- 登录失败限流（5 次锁定 15 分钟）
- 幂等键防重复提交（数据库唯一列持久化）
- CORS 白名单、关闭 X-Powered-By、错误响应不泄露内部细节

### 基础设施

- npm workspaces 统一管理、ESLint + Prettier 代码规范、GitHub Actions CI、Docker 部署

[1.0.0]: https://github.com/your-org/minierp/releases/tag/v1.0.0
