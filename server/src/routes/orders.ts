import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { toInt } from '../validate';

const router = Router();

// 订单的固定联查结构：客户 + 明细 + 商品
const orderInclude = {
  customer: true,
  items: { include: { product: true } },
} as const;

// 状态机：允许的流转（前后端共用同一规则，杜绝跳级）
export const STATUS_FLOW: Record<string, string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DONE'],
  DONE: [],
  CANCELLED: [],
};

// 订单列表（按创建时间倒序）
router.get('/', async (_req, res, next) => {
  try {
    const list = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// 创建订单：事务内校验库存/计算金额/扣库存；支持幂等键防重复提交
router.post('/', async (req, res, next) => {
  // 幂等键：客户端请求头 Idempotency-Key，相同 key 只创建一单
  const rawKey = req.headers['idempotency-key'];
  const keyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  const idempotencyKey = typeof keyStr === 'string' && keyStr.trim() ? keyStr.trim().slice(0, 64) : null;
  if (typeof keyStr === 'string' && keyStr.trim().length > 64) {
    return res.status(400).json({ message: '幂等键长度不能超过 64' });
  }

  try {
    // 幂等命中：已有相同 key 的订单直接返回（不重复扣库存）
    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
      if (existing) return res.json(existing);
    }

    const body = req.body || {};
    const customerId = toInt(body.customerId, 'customerId', { min: 1 });
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new HttpError(400, '请选择客户并至少添加一条订单明细');
    }

    const result = await prisma.$transaction(async (tx) => {
      // 客户必须存在
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new HttpError(400, '客户不存在');

      let total = 0;
      const orderItems: { productId: number; quantity: number; unitPrice: number }[] = [];

      for (const it of body.items) {
        const productId = toInt(it?.productId, 'productId', { min: 1 });
        const qty = toInt(it?.quantity, 'quantity', { min: 1, max: 1000000 });
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new HttpError(400, `商品不存在：${productId}`);

        // 原子扣减库存（防并发超卖）：
        // UPDATE ... SET stock = stock - qty WHERE id = ? AND stock >= qty
        // 利用行级锁，并发下只有一个事务扣减成功，其余 affected=0 走库存不足分支
        const updated = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        });
        if (updated.count === 0) {
          throw new HttpError(400, `「${product.name}」库存不足（剩余 ${product.stock}）`);
        }

        // 单价取商品当前价格快照，忽略客户端传入值（防篡改）
        total += product.price * qty;
        orderItems.push({ productId: product.id, quantity: qty, unitPrice: product.price });
      }

      // 订单号：时间戳 + 随机串，避免 Date.now() 高并发撞号
      const orderNo = 'SO' + Date.now() + randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
      return tx.order.create({
        data: {
          orderNo,
          customerId,
          idempotencyKey,
          totalAmount: Math.round(total * 100) / 100,
          remark: body.remark ? String(body.remark).slice(0, 500) : null,
          items: { create: orderItems },
        },
        include: orderInclude,
      });
    });

    res.json(result);
  } catch (e: any) {
    // 幂等键唯一冲突（并发同 key 双写）：另一个请求已创建，返回已有订单
    if (e.code === 'P2002' && idempotencyKey) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
      if (existing) return res.json(existing);
    }
    next(e);
  }
});

// 更新订单状态：严格按状态机流转（禁止跳级），取消时回补库存
router.patch('/:id/status', async (req, res, next) => {
  try {
    const id = toInt(Number(req.params.id), 'id', { min: 1 });
    const { status } = req.body || {};
    if (!status || !STATUS_FLOW[status]) {
      throw new HttpError(400, '非法的订单状态');
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw new HttpError(404, '订单不存在');

      const allowed = STATUS_FLOW[existing.status] || [];
      if (!allowed.includes(status)) {
        throw new HttpError(400, `订单状态不允许从 ${existing.status} 流转到 ${status}`);
      }

      const order = await tx.order.update({
        where: { id },
        data: { status },
        include: orderInclude,
      });

      // 取消订单：把之前扣掉的库存加回来（仅首次取消回补）
      if (status === 'CANCELLED' && existing.status !== 'CANCELLED') {
        for (const it of existing.items) {
          await tx.product.update({
            where: { id: it.productId },
            data: { stock: { increment: it.quantity } },
          });
        }
      }
      return order;
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
