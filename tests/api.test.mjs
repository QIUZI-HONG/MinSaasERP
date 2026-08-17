// ============================================================
// API 层测试：鉴权 / 商品 / 客户 / 订单 / 看板 全接口正向、反向、边界、异常用例
// 运行：node api.test.mjs （需后端已启动 http://localhost:3000）
// ============================================================
import { test, observe, summary } from './lib/runner.mjs';
import fs from 'node:fs';

const BASE = 'http://localhost:3000/api';
const results = [];

async function req(method, path, body, hdrs = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...hdrs },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON 响应 */ }
  return { status: res.status, data };
}

// 断言辅助
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertStatus(actual, expected, ctx) { assert(actual === expected, `${ctx}: 期望 ${expected}，实际 ${actual}`); }

let token = '';
let authHeaders = () => ({ Authorization: `Bearer ${token}` });

// ---------- A. 鉴权模块 ----------
console.log('\n===== A. 鉴权模块 =====');

await test('A1 登录成功：正确账号密码', async () => {
  const r = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assertStatus(r.status, 200, '登录');
  assert(r.data.token && r.data.token.length > 20, '应返回 JWT');
  assert(r.data.user.role === 'ADMIN', '角色应为 ADMIN');
  token = r.data.token;
});

await test('A2 登录失败：密码错误', async () => {
  const r = await req('POST', '/auth/login', { username: 'admin', password: 'wrong-pass' });
  assertStatus(r.status, 401, '错误密码');
});

await test('A3 登录失败：用户不存在', async () => {
  const r = await req('POST', '/auth/login', { username: 'no_such_user_xyz', password: 'x' });
  assertStatus(r.status, 401, '不存在用户');
});

await test('A4 登录失败：空用户名', async () => {
  const r = await req('POST', '/auth/login', { username: '', password: 'x' });
  assertStatus(r.status, 400, '空用户名');
});

await test('A5 登录失败：空密码', async () => {
  const r = await req('POST', '/auth/login', { username: 'admin', password: '' });
  assertStatus(r.status, 400, '空密码');
});

await test('A6 用户名带空格：trim 后正常登录（已修复）', async () => {
  const r = await req('POST', '/auth/login', { username: ' admin ', password: 'admin123' });
  assertStatus(r.status, 200, '空格用户名应被 trim 后接受');
});

await test('A7 注册成功', async () => {
  const u = 'tester_' + Date.now();
  const r = await req('POST', '/auth/register', { username: u, password: 'pass1234' });
  assertStatus(r.status, 200, '注册');
  assert(r.data.token, '应返回 token');
});

await test('A8 注册失败：重复用户名', async () => {
  const r = await req('POST', '/auth/register', { username: 'admin', password: 'x123456' });
  assertStatus(r.status, 400, '重复用户名');
});

await test('A9 注册失败：空密码', async () => {
  const r = await req('POST', '/auth/register', { username: 'u_' + Date.now(), password: '' });
  assertStatus(r.status, 400, '空密码');
});

await test('A10 超长用户名（1000 字符）被拒绝', async () => {
  const longName = 'x'.repeat(1000);
  const r = await req('POST', '/auth/register', { username: longName, password: 'p123456' });
  assertStatus(r.status, 400, '超长用户名应 400');
});

await test('A11 未带 token 访问受保护接口', async () => {
  const r = await req('GET', '/products');
  assertStatus(r.status, 401, '无 token');
});

await test('A12 非法 token（乱字符串）', async () => {
  const r = await req('GET', '/products', undefined, { Authorization: 'Bearer abc.def.ghi' });
  assertStatus(r.status, 401, '非法 token');
});

await test('A13 篡改 token 载荷（改 role 不重签）', async () => {
  const [h, p, s] = token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.role = 'SUPER_ADMIN';
  const fake = h + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + s;
  const r = await req('GET', '/products', undefined, { Authorization: `Bearer ${fake}` });
  assertStatus(r.status, 401, '篡改载荷');
});

await test('A14 错误 secret 签发的 token', async () => {
  // 用错误 secret 生成合法签名格式的 token
  const crypto = await import('node:crypto');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sig = crypto.createHmac('sha256', 'wrong-secret').update(`${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId: 1, username: 'admin', role: 'ADMIN', exp: 9999999999 })}`).digest('base64url');
  const fake = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId: 1, username: 'admin', role: 'ADMIN', exp: 9999999999 })}.${sig}`;
  const r = await req('GET', '/products', undefined, { Authorization: `Bearer ${fake}` });
  assertStatus(r.status, 401, '错误 secret');
});

await test('A15 过期 token', async () => {
  const crypto = await import('node:crypto');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ userId: 1, username: 'admin', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) - 3600 });
  const sig = crypto.createHmac('sha256', 'minierp-demo-secret-change-me').update(`${header}.${payload}`).digest('base64url');
  const expired = `${header}.${payload}.${sig}`;
  const r = await req('GET', '/products', undefined, { Authorization: `Bearer ${expired}` });
  assertStatus(r.status, 401, '过期 token');
});

// ---------- B. 商品模块 ----------
console.log('\n===== B. 商品模块 =====');
const createdProductIds = [];

await test('B1 商品列表正常', async () => {
  const r = await req('GET', '/products', undefined, authHeaders());
  assertStatus(r.status, 200, '列表');
  assert(r.data.length >= 6, `应至少 6 个种子商品，实际 ${r.data.length}`);
});

await test('B2 搜索命中（q=键盘）', async () => {
  const r = await req('GET', '/products?q=' + encodeURIComponent('键盘'), undefined, authHeaders());
  assertStatus(r.status, 200, '搜索');
  assert(r.data.length >= 1 && r.data.every((p) => p.name.includes('键盘')), '应只返回含「键盘」的商品');
});

await test('B3 搜索无结果（q=不存在的商品xyz）', async () => {
  const r = await req('GET', '/products?q=' + encodeURIComponent('不存在的商品xyz'), undefined, authHeaders());
  assertStatus(r.status, 200, '搜索无结果');
  assert(r.data.length === 0, '应返回空数组');
});

await test('B4 搜索特殊字符（q=% 通配符注入）', async () => {
  const r = await req('GET', '/products?q=%25', undefined, authHeaders());
  assertStatus(r.status, 200, '通配符搜索不应 500');
  assert(Array.isArray(r.data), '应返回数组');
});

await test('B5 新增商品成功', async () => {
  const sku = 'TEST-SKU-' + Date.now();
  const r = await req('POST', '/products', { sku, name: '测试商品', price: 99.9, stock: 10, category: '测试' }, authHeaders());
  assertStatus(r.status, 200, '新增');
  assert(r.data.id > 0, '应返回新商品 id');
  createdProductIds.push(r.data.id);
});

await test('B6 新增失败：缺 SKU', async () => {
  const r = await req('POST', '/products', { name: '无SKU商品', price: 10 }, authHeaders());
  assertStatus(r.status, 400, '缺 SKU');
});

await test('B7 新增失败：缺名称', async () => {
  const r = await req('POST', '/products', { sku: 'NO-NAME', price: 10 }, authHeaders());
  assertStatus(r.status, 400, '缺名称');
});

await test('B8 新增失败：缺价格', async () => {
  const r = await req('POST', '/products', { sku: 'NO-PRICE', name: '无价格' }, authHeaders());
  assertStatus(r.status, 400, '缺价格');
});

await test('B9 价格为 0 被拒绝（业务校验）', async () => {
  const r = await req('POST', '/products', { sku: 'ZERO-PRICE', name: '零价商品', price: 0 }, authHeaders());
  assertStatus(r.status, 400, '0 元商品应 400');
});

await test('B10 价格为负被拒绝（P1 缺陷修复）', async () => {
  const r = await req('POST', '/products', { sku: 'NEG-PRICE', name: '负价商品', price: -50 }, authHeaders());
  assertStatus(r.status, 400, '负价商品应 400');
});

await test('B11 新增失败：SKU 重复', async () => {
  const r = await req('POST', '/products', { sku: 'SKU-001', name: '重复SKU', price: 1 }, authHeaders());
  assertStatus(r.status, 400, 'SKU 重复');
});

await test('B12 修改商品成功', async () => {
  const sku = 'UPD-' + Date.now();
  const c = await req('POST', '/products', { sku, name: '待修改', price: 10, stock: 5 }, authHeaders());
  const r = await req('PUT', `/products/${c.data.id}`, { sku, name: '已修改', price: 20, stock: 7, category: '新类' }, authHeaders());
  assertStatus(r.status, 200, '修改');
  assert(r.data.name === '已修改' && r.data.price === 20, '修改内容应生效');
  createdProductIds.push(c.data.id);
});

await test('B13 修改失败：SKU 改为已存在', async () => {
  const r = await req('PUT', '/products/1', { sku: 'SKU-002', name: 'x', price: 1 }, authHeaders());
  assertStatus(r.status, 400, 'SKU 冲突');
});

await test('B14 删除未引用商品成功', async () => {
  const sku = 'DEL-' + Date.now();
  const c = await req('POST', '/products', { sku, name: '待删除', price: 1 }, authHeaders());
  const r = await req('DELETE', `/products/${c.data.id}`, undefined, authHeaders());
  assertStatus(r.status, 200, '删除');
});

await test('B15 删除失败：被订单引用（外键保护）', async () => {
  const r = await req('DELETE', '/products/1', undefined, authHeaders()); // SKU-001 被订单引用
  assertStatus(r.status, 400, '引用保护');
  assert(r.data.message && r.data.message.includes('引用'), '应返回友好提示');
});

await test('B16 删除不存在的商品返回 404（P2 缺陷修复）', async () => {
  const r = await req('DELETE', '/products/99999', undefined, authHeaders());
  assertStatus(r.status, 404, '不存在资源应 404');
});

// ---------- C. 客户模块 ----------
console.log('\n===== C. 客户模块 =====');

await test('C1 客户列表正常', async () => {
  const r = await req('GET', '/customers', undefined, authHeaders());
  assertStatus(r.status, 200, '列表');
  assert(r.data.length >= 4, `应至少 4 个种子客户，实际 ${r.data.length}`);
});

await test('C2 新增客户成功', async () => {
  const r = await req('POST', '/customers', { name: '测试客户_' + Date.now(), contact: '张三', phone: '13900000000' }, authHeaders());
  assertStatus(r.status, 200, '新增');
  assert(r.data.id > 0, '应返回 id');
});

await test('C3 新增失败：缺名称', async () => {
  const r = await req('POST', '/customers', { contact: 'x' }, authHeaders());
  assertStatus(r.status, 400, '缺名称');
});

await test('C4 修改客户成功', async () => {
  const c = await req('POST', '/customers', { name: '待改客户' }, authHeaders());
  const r = await req('PUT', `/customers/${c.data.id}`, { name: '已改客户', phone: '13700000001' }, authHeaders());
  assertStatus(r.status, 200, '修改');
  assert(r.data.name === '已改客户', '名称应更新');
});

await test('C5 删除失败：客户有订单（外键保护）', async () => {
  const r = await req('DELETE', '/customers/1', undefined, authHeaders());
  assertStatus(r.status, 400, '引用保护');
});

await test('C6 删除不存在的客户返回 404（P2 缺陷修复）', async () => {
  const r = await req('DELETE', '/customers/99999', undefined, authHeaders());
  assertStatus(r.status, 404, '不存在资源应 404');
});

// ---------- D. 订单模块 ----------
console.log('\n===== D. 订单模块 =====');
const createdOrderIds = [];

await test('D1 订单列表正常（含客户和明细）', async () => {
  const r = await req('GET', '/orders', undefined, authHeaders());
  assertStatus(r.status, 200, '列表');
  assert(r.data.length >= 3, '应至少 3 个种子订单');
  assert(r.data[0].customer && r.data[0].customer.name, '应联查客户');
  assert(Array.isArray(r.data[0].items), '应含明细数组');
});

await test('D2 创建订单成功并扣减库存', async () => {
  // 下单前查库存
  const before = (await req('GET', '/products?q=SKU-005', undefined, authHeaders())).data[0].stock;
  const r = await req('POST', '/orders', { customerId: 4, remark: 'API测试', items: [{ productId: 5, quantity: 2 }] }, authHeaders());
  assertStatus(r.status, 200, '下单');
  assert(r.data.totalAmount === 178, `金额应为 89*2=178，实际 ${r.data.totalAmount}`);
  const after = (await req('GET', '/products?q=SKU-005', undefined, authHeaders())).data[0].stock;
  assert(after === before - 2, `库存应从 ${before} 减到 ${before - 2}，实际 ${after}`);
  createdOrderIds.push(r.data.id);
});

await test('D3 下单失败：缺客户', async () => {
  const r = await req('POST', '/orders', { items: [{ productId: 1, quantity: 1 }] }, authHeaders());
  assertStatus(r.status, 400, '缺客户');
});

await test('D4 下单失败：空明细', async () => {
  const r = await req('POST', '/orders', { customerId: 1, items: [] }, authHeaders());
  assertStatus(r.status, 400, '空明细');
});

await test('D5 下单失败：商品不存在', async () => {
  const r = await req('POST', '/orders', { customerId: 1, items: [{ productId: 9999, quantity: 1 }] }, authHeaders());
  assertStatus(r.status, 400, '商品不存在');
  assert(r.data.message && r.data.message.includes('不存在'), '应返回友好提示');
});

await test('D6 下单失败：数量为 0', async () => {
  const r = await req('POST', '/orders', { customerId: 1, items: [{ productId: 1, quantity: 0 }] }, authHeaders());
  assertStatus(r.status, 400, '数量 0');
});

await test('D7 下单失败：数量为负', async () => {
  const r = await req('POST', '/orders', { customerId: 1, items: [{ productId: 1, quantity: -3 }] }, authHeaders());
  assertStatus(r.status, 400, '数量负');
});

await test('D8 下单失败：数量为小数', async () => {
  const r = await req('POST', '/orders', { customerId: 1, items: [{ productId: 1, quantity: 1.5 }] }, authHeaders());
  assertStatus(r.status, 400, '数量小数');
});

await test('D9 下单失败：库存不足', async () => {
  const r = await req('POST', '/orders', { customerId: 1, items: [{ productId: 3, quantity: 9999 }] }, authHeaders());
  assertStatus(r.status, 400, '库存不足');
  assert(r.data.message && r.data.message.includes('库存不足'), '应返回友好提示');
});

await test('D10 金额可信性：客户端伪造金额不生效', async () => {
  // 恶意客户端传 totalAmount: 0.01 和伪造 unitPrice
  const before = (await req('GET', '/products?q=SKU-001', undefined, authHeaders())).data[0].stock;
  const r = await req('POST', '/orders', {
    customerId: 4,
    totalAmount: 0.01,
    items: [{ productId: 1, quantity: 1, unitPrice: 0.01 }],
  }, authHeaders());
  assertStatus(r.status, 200, '下单');
  assert(r.data.totalAmount === 299, `金额应以后端单价 299 为准（防篡改），实际 ${r.data.totalAmount}`);
  const after = (await req('GET', '/products?q=SKU-001', undefined, authHeaders())).data[0].stock;
  assert(after === before - 1, '库存应正常扣减');
  createdOrderIds.push(r.data.id);
});

await test('D11 状态流转：PENDING→PAID→SHIPPED→DONE', async () => {
  const o = await req('POST', '/orders', { customerId: 4, items: [{ productId: 6, quantity: 1 }] }, authHeaders());
  createdOrderIds.push(o.data.id);
  for (const s of ['PAID', 'SHIPPED', 'DONE']) {
    const r = await req('PATCH', `/orders/${o.data.id}/status`, { status: s }, authHeaders());
    assertStatus(r.status, 200, `流转到 ${s}`);
    assert(r.data.status === s, '状态应更新');
  }
});

await test('D12 非法状态值', async () => {
  const o = await req('POST', '/orders', { customerId: 4, items: [{ productId: 6, quantity: 1 }] }, authHeaders());
  createdOrderIds.push(o.data.id);
  const r = await req('PATCH', `/orders/${o.data.id}/status`, { status: 'HACKED' }, authHeaders());
  assertStatus(r.status, 400, '非法状态');
});

await test('D13 状态跳级被拒绝（状态机校验，P3 缺陷修复）', async () => {
  const o = await req('POST', '/orders', { customerId: 4, items: [{ productId: 6, quantity: 1 }] }, authHeaders());
  createdOrderIds.push(o.data.id);
  const r = await req('PATCH', `/orders/${o.data.id}/status`, { status: 'DONE' }, authHeaders());
  assertStatus(r.status, 400, 'PENDING→DONE 跳级应 400');
});

await test('D14 取消订单回补库存（一致性）', async () => {
  const before = (await req('GET', '/products?q=SKU-004', undefined, authHeaders())).data[0].stock;
  const o = await req('POST', '/orders', { customerId: 4, items: [{ productId: 4, quantity: 3 }] }, authHeaders());
  assertStatus(o.status, 200, '下单');
  const mid = (await req('GET', '/products?q=SKU-004', undefined, authHeaders())).data[0].stock;
  assert(mid === before - 3, `下单后库存应为 ${before - 3}`);
  const c = await req('PATCH', `/orders/${o.data.id}/status`, { status: 'CANCELLED' }, authHeaders());
  assertStatus(c.status, 200, '取消');
  const after = (await req('GET', '/products?q=SKU-004', undefined, authHeaders())).data[0].stock;
  assert(after === before, `取消后库存应回到 ${before}，实际 ${after}`);
});

await test('D15 已取消订单不允许再次流转（状态机拦截）', async () => {
  const before = (await req('GET', '/products?q=SKU-002', undefined, authHeaders())).data[0].stock;
  const o = await req('POST', '/orders', { customerId: 4, items: [{ productId: 2, quantity: 2 }] }, authHeaders());
  await req('PATCH', `/orders/${o.data.id}/status`, { status: 'CANCELLED' }, authHeaders());
  // 再次 PATCH 取消：状态机应拒绝（CANCELLED 为终态）
  const again = await req('PATCH', `/orders/${o.data.id}/status`, { status: 'CANCELLED' }, authHeaders());
  assertStatus(again.status, 400, '已取消订单重复流转应 400');
  const after = (await req('GET', '/products?q=SKU-002', undefined, authHeaders())).data[0].stock;
  assert(after === before, `库存应只回补一次，实际 ${after}（期望 ${before}）`);
});

await test('D16 幂等键：相同 Idempotency-Key 并发请求只创建一单（P3 缺陷修复）', async () => {
  const sku = 'IDEM-' + Date.now();
  await req('POST', '/products', { sku, name: '幂等商品', price: 10, stock: 20 }, authHeaders());
  const products = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data;
  const pid = products[0].id;
  const key = 'test-key-' + Date.now();
  const payload = { customerId: 4, items: [{ productId: pid, quantity: 3 }] };
  const [r1, r2] = await Promise.all([
    req('POST', '/orders', payload, { ...authHeaders(), 'Idempotency-Key': key }),
    req('POST', '/orders', payload, { ...authHeaders(), 'Idempotency-Key': key }),
  ]);
  assert(r1.status === 200 && r2.status === 200, `两次请求都应 200（r1=${r1.status}, r2=${r2.status}）`);
  assert(r1.data.id === r2.data.id, '应返回同一个订单（幂等生效）');
  const after = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data[0];
  assert(after.stock === 17, `库存应只扣一次（20→17），实际 ${after.stock}`);
});

// ---------- E. 看板模块 ----------
console.log('\n===== E. 看板模块 =====');

await test('E1 看板统计字段齐全', async () => {
  const r = await req('GET', '/dashboard/stats', undefined, authHeaders());
  assertStatus(r.status, 200, '看板');
  for (const k of ['productCount', 'customerCount', 'orderCount', 'revenue', 'recentOrders']) {
    assert(k in r.data, `缺少字段 ${k}`);
  }
});

await test('E2 统计口径：取消订单不计入营收', async () => {
  const before = (await req('GET', '/dashboard/stats', undefined, authHeaders())).data;
  const o = await req('POST', '/orders', { customerId: 4, items: [{ productId: 2, quantity: 1 }] }, authHeaders());
  const paid = (await req('GET', '/dashboard/stats', undefined, authHeaders())).data;
  assert(paid.revenue === before.revenue + 129, `下单后营收应 +129，实际 ${paid.revenue - before.revenue}`);
  await req('PATCH', `/orders/${o.data.id}/status`, { status: 'CANCELLED' }, authHeaders());
  const after = (await req('GET', '/dashboard/stats', undefined, authHeaders())).data;
  assert(after.revenue === before.revenue, `取消后营收应回到 ${before.revenue}，实际 ${after.revenue}`);
});

await test('E3 订单金额一致性：明细之和 == totalAmount', async () => {
  const r = await req('GET', '/orders', undefined, authHeaders());
  for (const o of r.data) {
    const sum = o.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    assert(Math.abs(sum - o.totalAmount) < 0.01, `订单 ${o.orderNo} 明细和 ${sum} ≠ 总额 ${o.totalAmount}`);
  }
});

// ---------- 汇总 ----------
const result = summary('API 层');
results.push(result);

// 输出 JSON 供汇总脚本使用
fs.writeFileSync(new URL('./report/api-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log('API 测试结果已写入 report/api-result.json');
