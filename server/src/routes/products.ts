import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// 商品列表（支持按名称/SKU 搜索）
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const list = await prisma.product.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : undefined,
      orderBy: { id: 'desc' },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// 新增商品
router.post('/', async (req, res, next) => {
  try {
    const { sku, name, price, stock, category } = req.body || {};
    if (!sku || !name || price == null) {
      return res.status(400).json({ message: 'SKU、商品名称、价格不能为空' });
    }
    const product = await prisma.product.create({
      data: { sku, name, price: Number(price), stock: Number(stock) || 0, category: category || null },
    });
    res.json(product);
  } catch (e: any) {
    // P2002 = 唯一约束冲突（SKU 重复）
    if (e.code === 'P2002') return res.status(400).json({ message: 'SKU 已存在' });
    next(e);
  }
});

// 修改商品
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { sku, name, price, stock, category } = req.body || {};
    const product = await prisma.product.update({
      where: { id },
      data: { sku, name, price: Number(price), stock: Number(stock) || 0, category: category ?? null },
    });
    res.json(product);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'SKU 已存在' });
    next(e);
  }
});

// 删除商品（被订单引用时不允许删除）
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.product.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e: any) {
    // P2003 = 外键约束失败
    if (e.code === 'P2003') {
      return res.status(400).json({ message: '该商品已被订单引用，无法删除' });
    }
    next(e);
  }
});

export default router;
