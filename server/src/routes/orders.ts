import { Router } from 'express';
import { prisma } from '../db';
import { BizError } from '../errors';

const router = Router();

// 订单的固定联查结构：客户 + 明细 + 商品
const orderInclude = {
  customer: true,
  items: { include: { product: true } },
} as const;

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

// 创建订单：在数据库事务里校验库存、计算金额、扣减库存
router.post('/', async (req, res, next) => {
  try {
    const { customerId, items, remark } = req.body || {};
    if (!customerId || !Array.isArray(items) || items.length === 0) {
      throw new BizError('请选择客户并至少添加一条订单明细');
    }

    const result = await prisma.$transaction(async (tx) => {
      let total = 0;
      const orderItems: { productId: number; quantity: number; unitPrice: number }[] = [];

      for (const it of items) {
        const product = await tx.product.findUnique({ where: { id: Number(it.productId) } });
        if (!product) throw new BizError(`商品不存在：${it.productId}`);
        const qty = Number(it.quantity);
        if (!Number.isInteger(qty) || qty <= 0) throw new BizError('商品数量必须是正整数');
        if (product.stock < qty) {
          throw new BizError(`「${product.name}」库存不足（剩余 ${product.stock}）`);
        }
        // 单价取商品当前价格快照
        total += product.price * qty;
        orderItems.push({ productId: product.id, quantity: qty, unitPrice: product.price });
        // 扣减库存
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: qty } },
        });
      }

      const orderNo = 'SO' + Date.now().toString();
      return tx.order.create({
        data: {
          orderNo,
          customerId: Number(customerId),
          totalAmount: Math.round(total * 100) / 100,
          remark: remark || null,
          items: { create: orderItems },
        },
        include: orderInclude,
      });
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
});

// 更新订单状态（取消订单时回补库存）
router.patch('/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = ['PENDING', 'PAID', 'SHIPPED', 'DONE', 'CANCELLED'];
    if (!allowed.includes(status)) {
      throw new BizError('非法的订单状态');
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw new BizError('订单不存在');

      const order = await tx.order.update({
        where: { id },
        data: { status },
        include: orderInclude,
      });

      // 取消订单：把之前扣掉的库存加回来
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
