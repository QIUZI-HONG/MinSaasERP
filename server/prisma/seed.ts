// 演示数据初始化脚本：node 或 tsx 运行，可重复执行
// 用法：npm run db:seed
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化演示数据...');

  // 1. 管理员账号：admin / admin123
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash, role: 'ADMIN' },
  });

  // 2. 清空旧的业务数据（保证 Seed 可重复执行）
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();

  // 3. 商品
  const productData = [
    { sku: 'SKU-001', name: '机械键盘（青轴）', price: 299, stock: 50, category: '外设' },
    { sku: 'SKU-002', name: '无线鼠标', price: 129, stock: 80, category: '外设' },
    { sku: 'SKU-003', name: '27 寸 4K 显示器', price: 1599, stock: 20, category: '显示设备' },
    { sku: 'SKU-004', name: 'USB-C 扩展坞', price: 219, stock: 60, category: '配件' },
    { sku: 'SKU-005', name: '铝合金笔记本支架', price: 89, stock: 100, category: '配件' },
    { sku: 'SKU-006', name: '主动降噪耳机', price: 699, stock: 35, category: '音频' },
  ];
  for (const p of productData) {
    await prisma.product.create({ data: p });
  }

  // 4. 客户
  const customerData = [
    { name: '深圳市蓝海贸易有限公司', contact: '王经理', phone: '13800000001', address: '深圳市南山区' },
    { name: '上海星河电商', contact: '李女士', phone: '13800000002', address: '上海市浦东新区' },
    { name: '杭州云帆科技', contact: '张工', phone: '13800000003', address: '杭州市西湖区' },
    { name: '广州南沙跨境供应链', contact: '陈总', phone: '13800000004', address: '广州市南沙区' },
  ];
  for (const c of customerData) {
    await prisma.customer.create({ data: c });
  }

  // 5. 示例订单（含明细，totalAmount 由明细计算）
  const kbd = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-001' } });
  const mouse = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-002' } });
  const monitor = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-003' } });
  const hub = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-004' } });
  const headset = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-006' } });

  const orders = [
    {
      orderNo: 'SO20250106001',
      customerId: 1,
      status: 'PAID',
      remark: '客户要求顺丰发货',
      items: [
        { productId: kbd.id, quantity: 2, unitPrice: kbd.price },
        { productId: mouse.id, quantity: 1, unitPrice: mouse.price },
      ],
    },
    {
      orderNo: 'SO20250106002',
      customerId: 2,
      status: 'SHIPPED',
      remark: null,
      items: [
        { productId: monitor.id, quantity: 1, unitPrice: monitor.price },
        { productId: hub.id, quantity: 3, unitPrice: hub.price },
      ],
    },
    {
      orderNo: 'SO20250107001',
      customerId: 3,
      status: 'PENDING',
      remark: '待财务确认',
      items: [{ productId: headset.id, quantity: 5, unitPrice: headset.price }],
    },
  ];

  for (const o of orders) {
    const total = o.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    await prisma.order.create({
      data: {
        orderNo: o.orderNo,
        customerId: o.customerId,
        status: o.status,
        totalAmount: Math.round(total * 100) / 100,
        remark: o.remark,
        items: { create: o.items },
      },
    });
  }

  console.log('✅ Seed 完成！演示账号：admin / admin123');
}

main()
  .catch((e) => {
    console.error('Seed 失败：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
