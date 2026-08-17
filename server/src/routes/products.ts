import { Router } from 'express';
import { prisma } from '../db';
import { toNumber, toInt, toStr, toOptStr } from '../validate';

const router = Router();

// 商品列表（支持按名称/SKU 搜索）
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const list = await prisma.product.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : undefined,
      orderBy: { id: 'desc' },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// 新增商品（严格入参校验：价格必须为正数，杜绝 0 元/负价/非数字）
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const sku = toStr(body.sku, 'sku', { required: true, min: 1, max: 50 });
    const name = toStr(body.name, 'name', { required: true, min: 1, max: 100 });
    const price = toNumber(body.price, 'price', { min: 0.01, max: 99999999.99 });
    const stock = toInt(body.stock === undefined ? 0 : body.stock, 'stock', { min: 0, max: 1000000 });
    const category = toOptStr(body.category, 'category', { max: 50 });

    const product = await prisma.product.create({
      data: { sku, name, price, stock, category },
    });
    res.json(product);
  } catch (e: any) {
    // P2002 = 唯一约束冲突（SKU 重复）
    if (e.code === 'P2002') return res.status(400).json({ message: 'SKU 已存在' });
    next(e);
  }
});

// 修改商品（同样严格校验）
router.put('/:id', async (req, res, next) => {
  try {
    const id = toInt(Number(req.params.id), 'id', { min: 1 });
    const body = req.body || {};
    const sku = toStr(body.sku, 'sku', { required: true, min: 1, max: 50 });
    const name = toStr(body.name, 'name', { required: true, min: 1, max: 100 });
    const price = toNumber(body.price, 'price', { min: 0.01, max: 99999999.99 });
    const stock = toInt(body.stock === undefined ? 0 : body.stock, 'stock', { min: 0, max: 1000000 });
    const category = toOptStr(body.category, 'category', { max: 50 });

    const product = await prisma.product.update({
      where: { id },
      data: { sku, name, price, stock, category },
    });
    res.json(product);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(400).json({ message: 'SKU 已存在' });
    next(e);
  }
});

// 删除商品（被订单引用时不允许删除；不存在时返回 404）
router.delete('/:id', async (req, res, next) => {
  try {
    const id = toInt(Number(req.params.id), 'id', { min: 1 });
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    // P2003 = 外键约束失败（被订单引用）
    if (e.code === 'P2003') {
      return res.status(400).json({ message: '该商品已被订单引用，无法删除' });
    }
    // P2025 = 记录不存在 → 404（由全局错误处理兜底，这里显式处理更清晰）
    if (e.code === 'P2025') {
      return res.status(404).json({ message: '商品不存在' });
    }
    next(e);
  }
});

export default router;
