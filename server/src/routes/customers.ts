import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// 客户列表
router.get('/', async (_req, res, next) => {
  try {
    const list = await prisma.customer.findMany({ orderBy: { id: 'desc' } });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// 新增客户
router.post('/', async (req, res, next) => {
  try {
    const { name, contact, phone, address } = req.body || {};
    if (!name) {
      return res.status(400).json({ message: '客户名称不能为空' });
    }
    const customer = await prisma.customer.create({ data: { name, contact, phone, address } });
    res.json(customer);
  } catch (e) {
    next(e);
  }
});

// 修改客户
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, contact, phone, address } = req.body || {};
    const customer = await prisma.customer.update({
      where: { id },
      data: { name, contact, phone, address },
    });
    res.json(customer);
  } catch (e) {
    next(e);
  }
});

// 删除客户（有订单时不允许删除）
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.customer.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === 'P2003') {
      return res.status(400).json({ message: '该客户已有订单，无法删除' });
    }
    next(e);
  }
});

export default router;
