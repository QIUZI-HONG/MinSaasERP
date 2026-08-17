import { Router } from 'express';
import { prisma } from '../db';
import { toInt, toStr, toOptStr } from '../validate';

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

// 新增客户（名称必填 + 长度上限）
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = toStr(body.name, 'name', { required: true, min: 1, max: 100 });
    const contact = toOptStr(body.contact, 'contact', { max: 50 });
    const phone = toOptStr(body.phone, 'phone', { max: 30 });
    const address = toOptStr(body.address, 'address', { max: 200 });

    const customer = await prisma.customer.create({ data: { name, contact, phone, address } });
    res.json(customer);
  } catch (e) {
    next(e);
  }
});

// 修改客户
router.put('/:id', async (req, res, next) => {
  try {
    const id = toInt(Number(req.params.id), 'id', { min: 1 });
    const body = req.body || {};
    const name = toStr(body.name, 'name', { required: true, min: 1, max: 100 });
    const contact = toOptStr(body.contact, 'contact', { max: 50 });
    const phone = toOptStr(body.phone, 'phone', { max: 30 });
    const address = toOptStr(body.address, 'address', { max: 200 });

    const customer = await prisma.customer.update({
      where: { id },
      data: { name, contact, phone, address },
    });
    res.json(customer);
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ message: '客户不存在' });
    next(e);
  }
});

// 删除客户（有订单时不允许删除；不存在时返回 404）
router.delete('/:id', async (req, res, next) => {
  try {
    const id = toInt(Number(req.params.id), 'id', { min: 1 });
    await prisma.customer.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === 'P2003') {
      return res.status(400).json({ message: '该客户已有订单，无法删除' });
    }
    if (e.code === 'P2025') {
      return res.status(404).json({ message: '客户不存在' });
    }
    next(e);
  }
});

export default router;
