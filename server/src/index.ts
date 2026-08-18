// 服务入口：构建 app 并监听端口（本地/Docker 模式）
// Serverless 部署（Vercel）时直接复用 app.ts，见根目录 api/index.ts
import { app } from './app';
import { logger } from './logger';

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  logger.info(`MiniSaaS ERP API 已启动：http://localhost:${PORT}`);
});
