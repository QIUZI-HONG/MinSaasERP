// ============================================================
// 安全专项测试：注入 / XSS / 暴力破解 / 信息泄露 / 响应头 / 类型异常
// 运行：node security.test.mjs
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
  try { data = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, data, raw: await res.text().catch(() => '') };
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertStatus(actual, expected, ctx) { assert(actual === expected, `${ctx}: 期望 ${expected}，实际 ${actual}`); }

let token = '';
const authHeaders = () => ({ Authorization: `Bearer ${token}` });

// 先登录
{
  const r = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  token = r.data.token;
}

console.log('\n===== S1. SQL 注入 =====');

await test('S1-1 商品搜索：经典 OR 注入', async () => {
  const r = await req('GET', '/products?q=' + encodeURIComponent("1' OR '1'='1"), undefined, authHeaders());
  assertStatus(r.status, 200, 'OR 注入不应 500');
  assert(Array.isArray(r.data), '应返回数组');
});

await test('S1-2 商品搜索：注释注入', async () => {
  const r = await req('GET', '/products?q=' + encodeURIComponent("'; DROP TABLE Product;--"), undefined, authHeaders());
  assertStatus(r.status, 200, '注释注入不应 500');
  assert(Array.isArray(r.data), '应返回数组');
});

await test('S1-3 登录：用户名注入', async () => {
  const r = await req('POST', '/auth/login', { username: "admin' OR '1'='1", password: 'x' });
  assertStatus(r.status, 401, '登录注入应被拒绝');
});

await test('S1-4 登录：万能密码注入', async () => {
  const r = await req('POST', '/auth/login', { username: 'admin', password: "' OR '1'='1" });
  assertStatus(r.status, 401, '万能密码应被拒绝');
});

await test('S1-5 数据库完整性：商品表未被注入破坏', async () => {
  const r = await req('GET', '/products', undefined, authHeaders());
  assertStatus(r.status, 200, '商品列表仍可访问');
  assert(r.data.length >= 6, '商品数据应完整');
});

console.log('\n===== S2. XSS（存储型载体验证） =====');

let xssProductId = null;
await test('S2-1 商品名可存储 XSS 载体', async () => {
  const payload = '<script>window.__xss=1</script>';
  const r = await req('POST', '/products', { sku: 'XSS-' + Date.now(), name: payload, price: 1 }, authHeaders());
  assertStatus(r.status, 200, '创建');
  xssProductId = r.data.id;
});

await test('S2-2 客户名可存储 XSS 载体', async () => {
  const r = await req('POST', '/customers', { name: '<img src=x onerror=alert(1)>' }, authHeaders());
  assertStatus(r.status, 200, '创建');
  observe('S2-2b 存储型 XSS 载体已入库，最终防护取决于前端渲染是否转义（见 UI 测试 U7）');
});

console.log('\n===== S3. 鉴权攻击面 =====');

await test('S3-1 空 Bearer token', async () => {
  const r = await req('GET', '/products', undefined, { Authorization: 'Bearer ' });
  assertStatus(r.status, 401, '空 Bearer');
});

await test('S3-2 无 Bearer 前缀', async () => {
  const r = await req('GET', '/products', undefined, { Authorization: token });
  assertStatus(r.status, 401, '无 Bearer 前缀');
});

await test('S3-3 token 类型异常（数字）', async () => {
  const r = await req('GET', '/products', undefined, { Authorization: 'Bearer 123456' });
  assertStatus(r.status, 401, '数字 token');
});

{
  let blocked = false;
  for (let i = 0; i < 6; i++) {
    const r = await req('POST', '/auth/login', { username: 'admin', password: 'brute_' + i });
    if (r.status !== 401) { blocked = true; break; }
  }
  observe(`S3-4 暴力破解防护：连续 6 次错误密码${blocked ? '被限流/锁定（有防护）' : '全部仅返回 401，无锁定/限流（⚠️ 建议加登录失败限流与锁定）'}`);
}

console.log('\n===== S4. 信息泄露 =====');

await test('S4-1 服务器内部错误不泄露堆栈', async () => {
  const r = await req('DELETE', '/products/99999', undefined, authHeaders());
  assertStatus(r.status, 500, '触发内部错误');
  const body = r.raw;
  assert(!body.includes('at ') && !body.includes('node_modules') && !body.includes('RequestHandler'), '响应不应含堆栈信息');
  assert(r.data.message && !String(r.data.message).includes('Prisma'), '错误消息不应泄露内部细节');
});

await test('S4-2 登录失败响应不泄露用户是否存在', async () => {
  const a = await req('POST', '/auth/login', { username: 'admin', password: 'wrong' });
  const b = await req('POST', '/auth/login', { username: 'ghost_user_zz', password: 'wrong' });
  assert(a.data.message === b.data.message, '两种失败应返回相同提示（防用户名枚举）');
});

await test('S4-3 响应头：X-Powered-By', async () => {
  const res = await fetch(BASE + '/health');
  observe(`S4-3 响应头 X-Powered-By: ${res.headers.get('x-powered-by') || '（无，已移除或未暴露）'}${res.headers.get('x-powered-by') ? '（⚠️ 暴露技术栈信息，建议 app.disable("x-powered-by")）' : ''}`);
});

await test('S4-4 CORS 配置检查', async () => {
  const res = await fetch(BASE + '/health', { headers: { Origin: 'https://evil.example.com' } });
  const acao = res.headers.get('access-control-allow-origin');
  observe(`S4-4 CORS Access-Control-Allow-Origin: ${acao}${acao === '*' ? '（⚠️ 全开放，生产环境应收敛为白名单）' : ''}`);
});

console.log('\n===== S5. 请求健壮性 =====');

await test('S5-1 请求体为 JSON 数组', async () => {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: '[1,2,3]',
  });
  assert([400, 401].includes(res.status), `期望 400/401，实际 ${res.status}`);
});

await test('S5-2 请求体为 null / 空', async () => {
  const r = await req('POST', '/auth/login', null);
  assert([400, 401].includes(r.status), `期望 400/401，实际 ${r.status}`);
});

await test('S5-3 字段类型异常：price 为字符串 abc', async () => {
  const r = await req('POST', '/products', { sku: 'BAD-TYPE-1', name: 'x', price: 'abc' }, authHeaders());
  observe(`S5-3 price="abc"：返回 ${r.status}${r.status === 200 ? `（⚠️ 字符串价格被接受，实际存入 ${r.data?.price}——NaN 风险）` : ''}`);
});

await test('S5-4 字段类型异常：quantity 为布尔 true', async () => {
  const r = await req('POST', '/orders', { customerId: 4, items: [{ productId: 6, quantity: true }] }, authHeaders());
  observe(`S5-4 quantity=true：返回 ${r.status}${r.status === 200 ? '（⚠️ 布尔被 Number() 转为 1，宽松校验）' : ''}`);
});

await test('S5-5 超大请求体（>100KB 默认限制）', async () => {
  const big = { username: 'admin', password: 'x'.repeat(200 * 1024) };
  const r = await req('POST', '/auth/login', big);
  observe(`S5-5 200KB 请求体：返回 ${r.status}${r.status === 413 ? '（正确触发 413 Payload Too Large）' : r.status === 400 || r.status === 401 ? '（被解析但超大密码未超限校验——建议加长度限制）' : '（⚠️ 意外状态 ' + r.status + '）'}`);
});

await test('S5-6 不支持的方法', async () => {
  const res = await fetch(BASE + '/products', { method: 'PUT', headers: authHeaders() });
  assert(res.status === 404 || res.status === 405, `期望 404/405，实际 ${res.status}`);
});

await test('S5-7 路径遍历', async () => {
  const res = await fetch(BASE + '/../../etc/passwd', { headers: authHeaders() });
  assert(res.status === 404, `路径遍历应 404，实际 ${res.status}`);
});

console.log('\n===== S6. 密码存储审计（直查数据库） =====');

await test('S6-1 密码以 bcrypt 哈希存储，非明文', async () => {
  // 用 Node 内置 sqlite 直查数据库（不经 API，审计真实存储）
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync('D:/Test03/server/prisma/dev.db');
  const row = db.prepare('SELECT username, passwordHash FROM User WHERE username = ?').get('admin');
  db.close();
  assert(row, 'admin 用户应存在');
  assert(String(row.passwordHash).startsWith('$2'), `应为 bcrypt 格式($2...)，实际前缀 ${String(row.passwordHash).slice(0, 4)}`);
  assert(!String(row.passwordHash).includes('admin123'), '哈希不应包含明文');
  // 复用 server 目录下的 bcryptjs 验证哈希可校验
  const { createRequire } = await import('node:module');
  const require = createRequire('D:/Test03/server/package.json');
  const bcrypt = require('bcryptjs');
  assert(await bcrypt.compare('admin123', String(row.passwordHash)), '哈希应可通过 bcrypt 校验');
});

// ---------- 汇总 ----------
const result = summary('安全专项');
results.push(result);
fs.writeFileSync(new URL('./report/security-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log('安全测试结果已写入 report/security-result.json');
