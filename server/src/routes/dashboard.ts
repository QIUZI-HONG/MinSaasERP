import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// 看板统计：各类总数 + 营收 + 最近订单
router.get('/stats', async (_req, res, next) => {
  try {
    const [productCount, customerCount, orderCount, agg, recentOrders] = await Promise.all([
      prisma.product.count(),
      prisma.customer.count(),
      prisma.order.count(),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: { not: 'CANCELLED' } },
      }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, items: { include: { product: true } } },
      }),
    ]);

    res.json({
      productCount,
      customerCount,
      orderCount,
      revenue: agg._sum.totalAmount ?? 0,
      recentOrders,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
