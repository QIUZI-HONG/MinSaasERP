import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import customerRoutes from './routes/customers';
import orderRoutes from './routes/orders';
import dashboardRoutes from './routes/dashboard';
import { requireAuth } from './middleware/auth';
import { HttpError } from './errors';
import { logger } from './logger';

dotenv.config();

const app = express();

// 安全加固
app.disable('x-powered-by'); // 不暴露技术栈信息
app.use(helmet()); // 安全响应头（CSP / HSTS / X-Content-Type-Options 等）

// CORS 白名单：环境变量 CORS_ORIGINS 配置，默认放行本地开发前端
// 无 Origin 的请求（curl / 同源代理 / 服务端调用）不受影响
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // 非白名单来源：不返回 Access-Control-Allow-Origin，浏览器会拦截
      callback(null, false);
    },
  })
);

// 中间件：解析 JSON 请求体
app.use(express.json());

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 路由挂载：除登录注册外，其余接口都要求携带 JWT
app.use('/api/auth', authRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/orders', requireAuth, orderRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 统一错误处理：按错误类型分级返回，绝不泄露内部细节
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // 1. body-parser 产生的客户端错误：畸形 JSON → 400，超大请求体 → 413
  if (err && typeof err.status === 'number' && err.status >= 400 && err.status < 500 && err.type) {
    const message = err.status === 413 ? '请求体过大' : '请求体格式错误';
    return res.status(err.status).json({ message });
  }
  // 2. 显式抛出的业务/参数错误（HttpError / BizError）
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  // 3. Prisma P2025：操作目标记录不存在（删除/更新不存在的 id）
  if (err && err.code === 'P2025') {
    return res.status(404).json({ message: '资源不存在' });
  }
  // 4. 兜底：内部错误，记录日志但不泄露堆栈
  logger.error('服务器内部错误', { message: err?.message, stack: err?.stack });
  res.status(500).json({ message: '服务器内部错误，请稍后再试' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  logger.info(`MiniSaaS ERP API 已启动：http://localhost:${PORT}`);
});
