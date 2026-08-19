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
  try {
    data = await res.json();
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, data, raw: await res.text().catch(() => '') };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertStatus(actual, expected, ctx) {
  assert(actual === expected, `${ctx}: 期望 ${expected}，实际 ${actual}`);
}

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
  const r = await req(
    'GET',
    '/products?q=' + encodeURIComponent("'; DROP TABLE Product;--"),
    undefined,
    authHeaders()
  );
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
  const r = await req(
    'POST',
    '/products',
    { sku: 'XSS-' + Date.now(), name: payload, price: 1 },
    authHeaders()
  );
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

await test('S3-4 暴力破解防护：连续 5 次失败后锁定（P3 缺陷修复）', async () => {
  // 用专用测试账号，避免锁定 admin 影响其他用例
  const bruteUser = 'brute_' + Date.now();
  await req('POST', '/auth/register', { username: bruteUser, password: 'pass1234' });
  let lastStatus = 0;
  for (let i = 0; i < 6; i++) {
    const r = await req('POST', '/auth/login', { username: bruteUser, password: 'brute_' + i });
    lastStatus = r.status;
  }
  assertStatus(lastStatus, 429, '第 6 次失败应触发限流锁定');
  // 锁定后即使密码正确也被拒
  const locked = await req('POST', '/auth/login', { username: bruteUser, password: 'pass1234' });
  assertStatus(locked.status, 429, '锁定期内正确密码也应被拒');
});

console.log('\n===== S4. 信息泄露 =====');

await test('S4-1 错误响应不泄露堆栈（P2 修复后：删除不存在返回 404）', async () => {
  const r = await req('DELETE', '/products/99999', undefined, authHeaders());
  assertStatus(r.status, 404, '删除不存在应 404 而非 500');
  const body = r.raw;
  assert(
    !body.includes('at ') && !body.includes('node_modules') && !body.includes('RequestHandler'),
    '响应不应含堆栈信息'
  );
  assert(r.data.message === '商品不存在', '404 应返回友好消息');
});

await test('S4-2 登录失败响应不泄露用户是否存在', async () => {
  const a = await req('POST', '/auth/login', { username: 'admin', password: 'wrong' });
  const b = await req('POST', '/auth/login', { username: 'ghost_user_zz', password: 'wrong' });
  assert(a.data.message === b.data.message, '两种失败应返回相同提示（防用户名枚举）');
});

await test('S4-3 响应头：不暴露 X-Powered-By（P3 缺陷修复）', async () => {
  const res = await fetch(BASE + '/health');
  assert(res.headers.get('x-powered-by') === null, '不应返回 X-Powered-By 头');
});

await test('S4-4 CORS 白名单：非白名单来源不返回 CORS 头（P3 缺陷修复）', async () => {
  const evil = await fetch(BASE + '/health', { headers: { Origin: 'https://evil.example.com' } });
  assert(evil.headers.get('access-control-allow-origin') === null, '恶意来源不应获得 ACAO 头');
  const allowed = await fetch(BASE + '/health', { headers: { Origin: 'http://localhost:5173' } });
  assert(
    allowed.headers.get('access-control-allow-origin') === 'http://localhost:5173',
    '白名单来源应获得 ACAO 头'
  );
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

await test('S5-2 请求体为 null / 空：返回 400（P2 缺陷修复）', async () => {
  const r = await req('POST', '/auth/login', null);
  assertStatus(r.status, 400, 'null body 应 400 而非 500');
});

await test('S5-3 字段类型异常：price 为字符串 abc 返回 400（P2 缺陷修复）', async () => {
  const r = await req('POST', '/products', { sku: 'BAD-TYPE-1', name: 'x', price: 'abc' }, authHeaders());
  assertStatus(r.status, 400, '非数字价格应 400');
});

await test('S5-4 字段类型异常：quantity 为布尔 true 返回 400（P3 缺陷修复）', async () => {
  const r = await req(
    'POST',
    '/orders',
    { customerId: 4, items: [{ productId: 6, quantity: true }] },
    authHeaders()
  );
  assertStatus(r.status, 400, '布尔数量应 400（严格类型校验）');
});

await test('S5-5 超大请求体（>100KB）返回 413（P2 缺陷修复）', async () => {
  const big = { username: 'admin', password: 'x'.repeat(200 * 1024) };
  const r = await req('POST', '/auth/login', big);
  assertStatus(r.status, 413, '超大请求体应 413');
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
  // 直查数据库（MySQL）审计真实存储：通过 server 的 Prisma 客户端
  const { createRequire } = await import('node:module');
  const require = createRequire('D:/Test03/server/package.json');
  const dotenv = require('dotenv');
  dotenv.config({ path: 'D:/Test03/server/.env' });
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { username: 'admin' } });
    assert(user, 'admin 用户应存在');
    assert(
      String(user.passwordHash).startsWith('$2'),
      `应为 bcrypt 格式($2...)，实际前缀 ${String(user.passwordHash).slice(0, 4)}`
    );
    assert(!String(user.passwordHash).includes('admin123'), '哈希不应包含明文');
    assert(await bcrypt.compare('admin123', String(user.passwordHash)), '哈希应可通过 bcrypt 校验');
  } finally {
    await prisma.$disconnect();
  }
});

// ---------- 汇总 ----------
const result = summary('安全专项');
results.push(result);
fs.mkdirSync(new URL('./report/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./report/security-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log('安全测试结果已写入 report/security-result.json');
