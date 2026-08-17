import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import customerRoutes from './routes/customers';
import orderRoutes from './routes/orders';
import dashboardRoutes from './routes/dashboard';
import { requireAuth } from './middleware/auth';
import { BizError } from './errors';

dotenv.config();

const app = express();

// 中间件：允许跨域 + 解析 JSON 请求体
app.use(cors());
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

// 统一错误处理：业务错误返回 400，其余返回 500
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof BizError) {
    return res.status(400).json({ message: err.message });
  }
  console.error('[服务器错误]', err);
  res.status(500).json({ message: '服务器内部错误，请稍后再试' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`✅ MiniSaaS ERP API 已启动：http://localhost:${PORT}`);
});
