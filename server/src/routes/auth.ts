import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { signToken } from '../middleware/auth';
import { toStr } from '../validate';

const router = Router();

// ---------- 登录限流（内存实现）：连续失败 5 次锁定 15 分钟 ----------
// 注意：挂到 globalThis 复用实例，避免 tsx watch 模块热重载时 new Map() 被重建导致计数丢失
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const failTracker: Map<string, { count: number; lockUntil: number }> =
  ((globalThis as any).__failTracker as Map<string, { count: number; lockUntil: number }>) ??
  (((globalThis as any).__failTracker = new Map()) as Map<string, { count: number; lockUntil: number }>);

function lockKey(username: string, ip: string): string {
  return `${username}|${ip}`;
}

function recordFail(key: string) {
  const rec = failTracker.get(key);
  const now = Date.now();
  // 仅当「曾锁定且已过期」时重置计数；未锁定（lockUntil=0）或锁定中都继续累加
  const reset = !!rec && rec.lockUntil > 0 && rec.lockUntil <= now;
  const count = (reset || !rec ? 0 : rec.count) + 1;
  failTracker.set(key, {
    count,
    // 达到阈值才设置锁定时间；未锁定为 0（lockRemainMs 不会删除未锁定条目）
    lockUntil: count >= MAX_FAILS ? now + LOCK_MS : 0,
  });
}

function lockRemainMs(key: string): number {
  const rec = failTracker.get(key);
  if (!rec) return 0;
  const remain = rec.lockUntil - Date.now();
  if (remain > 0) return remain; // 锁定中
  // 仅当「曾锁定且已过期」时清理条目；lockUntil=0 表示未锁定，保留计数继续累积
  if (rec.lockUntil > 0) failTracker.delete(key);
  return 0;
}

function clearFails(key: string) {
  failTracker.delete(key);
}

// 注册（演示项目开放注册；正式系统通常由管理员建号）
router.post('/register', async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = toStr(body.username, 'username', { required: true, min: 3, max: 50 });
    const password = toStr(body.password, 'password', { required: true, min: 6, max: 100 });
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'SALES'; // 不允许注册任意角色

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, passwordHash, role },
    });
    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    next(e);
  }
});

// 登录：校验密码后签发 JWT；带失败限流
router.post('/login', async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = toStr(body.username, 'username', { required: true, min: 1, max: 50 });
    const password = toStr(body.password, 'password', { required: true, min: 1, max: 100 });
    const key = lockKey(username, req.ip || '');

    // 限流检查
    const remain = lockRemainMs(key);
    if (remain > 0) {
      return res.status(429).json({ message: `尝试过于频繁，请 ${Math.ceil(remain / 1000)} 秒后再试` });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      recordFail(key);
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      recordFail(key);
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    clearFails(key);
    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    next(e);
  }
});

export default router;
