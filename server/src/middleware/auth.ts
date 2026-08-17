import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// JWT 载荷内容
export interface AuthPayload {
  userId: number;
  username: string;
  role: string;
}

// 把用户信息挂到 req.user 上，方便后续路由取用
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// 签发 token（有效期 7 天）
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

// 鉴权中间件：校验 Authorization: Bearer <token>
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未登录或 token 缺失' });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }
}
