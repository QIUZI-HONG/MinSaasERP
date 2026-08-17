// ============================================================
// 并发与健壮性专项：超卖并发 / 订单号唯一性 / 库存一致性 / 幂等性
// 运行：node stress.test.mjs
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
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertStatus(actual, expected, ctx) { assert(actual === expected, `${ctx}: 期望 ${expected}，实际 ${actual}`); }

let token = '';
const authHeaders = () => ({ Authorization: `Bearer ${token}` });
{
  const r = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  token = r.data.token;
}

// ---------- 超卖并发 ----------
console.log('\n===== 并发 1. 超卖防护 =====');

await test('并发 10 个请求抢购库存仅 5 件的商品：恰好成功 5 个，不超卖', async () => {
  // 准备：创建一个库存为 5 的测试商品
  const sku = 'RACE-' + Date.now();
  const created = await req('POST', '/products', { sku, name: '并发测试商品', price: 10, stock: 5 }, authHeaders());
  assert(created.status === 200, '测试商品创建失败');
  const pid = created.data.id;

  // 并发 10 个下单请求，每个买 1 件
  const payload = { customerId: 4, items: [{ productId: pid, quantity: 1 }] };
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => req('POST', '/orders', payload, authHeaders()))
  );
  const okCount = responses.filter((r) => r.status === 200).length;
  const failCount = responses.filter((r) => r.status === 400).length;
  const serverErr = responses.filter((r) => r.status === 500).length;

  // 最终库存必须 >= 0（核心：绝不超卖）
  const after = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data[0];
  assert(after.stock === 0, `库存应为 0（卖完 5 件），实际 ${after.stock}`);
  assert(okCount === 5, `应恰好成功 5 单，实际成功 ${okCount}`);
  observe(`超卖并发结果：成功 ${okCount}，库存不足拒绝 ${failCount}，服务器错误 ${serverErr}${serverErr > 0 ? '（⚠️ 并发下出现 500）' : ''}`);
});

// ---------- 订单号唯一性 ----------
console.log('\n===== 并发 2. 订单号唯一性 =====');

await test('并发 15 单：订单号无重复', async () => {
  const sku = 'UNIQ-' + Date.now();
  await req('POST', '/products', { sku, name: '唯一性商品', price: 1, stock: 30 }, authHeaders());
  const products = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data;
  const pid = products[0].id;

  const payload = { customerId: 4, items: [{ productId: pid, quantity: 1 }] };
  const responses = await Promise.all(
    Array.from({ length: 15 }, () => req('POST', '/orders', payload, authHeaders()))
  );
  const created = responses.filter((r) => r.status === 200).map((r) => r.data.orderNo);
  const failed = responses.filter((r) => r.status !== 200);
  const unique = new Set(created);
  assert(unique.size === created.length, `订单号重复！共 ${created.length} 单，唯一 ${unique.size} 个`);
  observe(`订单号唯一性：成功 ${created.length} 单全部唯一${failed.length > 0 ? `，失败 ${failed.length} 单（原因见下）` : ''}`);
  for (const f of failed.slice(0, 3)) {
    observe(`  失败单: HTTP ${f.status} ${f.data?.message || ''}`);
  }
});

// ---------- 库存一致性 ----------
console.log('\n===== 并发 3. 库存一致性（下单-取消循环） =====');

await test('下单-取消循环 5 轮后库存精确回补', async () => {
  const sku = 'CYCLE-' + Date.now();
  await req('POST', '/products', { sku, name: '循环测试商品', price: 5, stock: 100 }, authHeaders());
  const products = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data;
  const pid = products[0].id;

  for (let i = 0; i < 5; i++) {
    const o = await req('POST', '/orders', { customerId: 4, items: [{ productId: pid, quantity: 2 }] }, authHeaders());
    assert(o.status === 200, `第 ${i + 1} 轮下单失败: ${o.data?.message}`);
    const c = await req('PATCH', `/orders/${o.data.id}/status`, { status: 'CANCELLED' }, authHeaders());
    assert(c.status === 200, `第 ${i + 1} 轮取消失败`);
  }
  const after = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data[0];
  assert(after.stock === 100, `5 轮下单-取消后库存应为 100，实际 ${after.stock}`);
});

// ---------- 幂等性 ----------
console.log('\n===== 并发 4. 幂等性检查 =====');

await test('重复提交（带幂等键）：相同 Idempotency-Key 只创建一单（P3 缺陷修复）', async () => {
  const sku = 'IDEM-' + Date.now();
  await req('POST', '/products', { sku, name: '幂等商品', price: 1, stock: 10 }, authHeaders());
  const products = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data;
  const pid = products[0].id;

  const payload = { customerId: 4, items: [{ productId: pid, quantity: 1 }] };
  const key = 'stress-key-' + Date.now();
  // 完全相同的请求连发两次，携带同一幂等键（模拟 UI 双击 / 重试）
  const [r1, r2] = await Promise.all([
    req('POST', '/orders', payload, { ...authHeaders(), 'Idempotency-Key': key }),
    req('POST', '/orders', payload, { ...authHeaders(), 'Idempotency-Key': key }),
  ]);
  assert(r1.status === 200 && r2.status === 200, '两次都应 200');
  assert(r1.data.id === r2.data.id, '应返回同一订单');
  const after = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data[0];
  assert(after.stock === 9, `库存应只扣 1 次（10→9），实际 ${after.stock}`);
});

// ---------- 边界健壮性 ----------
console.log('\n===== 并发 5. 边界数据 =====');

await test('超长商品名（2000 字符）被拒绝（P3 缺陷修复）', async () => {
  const longName = '长'.repeat(2000);
  const r = await req('POST', '/products', { sku: 'LONG-' + Date.now(), name: longName, price: 1 }, authHeaders());
  assertStatus(r.status, 400, '超长名称应 400');
});

await test('极端数值：价格 99999999.99 与数量 1000000', async () => {
  const sku = 'BIG-' + Date.now();
  await req('POST', '/products', { sku, name: '大数值商品', price: 99999999.99, stock: 1000000 }, authHeaders());
  const products = (await req('GET', `/products?q=${sku}`, undefined, authHeaders())).data;
  const pid = products[0].id;
  const r = await req('POST', '/orders', { customerId: 4, items: [{ productId: pid, quantity: 1000000 }] }, authHeaders());
  assert(r.status === 200, `大额订单应成功: ${r.status} ${r.data?.message || ''}`);
  assert(r.data.totalAmount === 99999999.99 * 1000000, '金额应精确计算');
});

// ---------- 汇总 ----------
const result = summary('并发与健壮性');
results.push(result);
fs.writeFileSync(new URL('./report/stress-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log('并发测试结果已写入 report/stress-result.json');
