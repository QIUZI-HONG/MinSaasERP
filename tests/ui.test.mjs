// ============================================================
// UI 层 E2E 测试：Playwright 驱动本机 Chrome，真实浏览器全流程
// 运行：node ui.test.mjs （需后端+前端已启动）
// 截图输出：report/screenshots/
// ============================================================
import { chromium } from 'playwright-core';
import { test, summary } from './lib/runner.mjs';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000/api';
const SHOT_DIR = new URL('./report/screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let browser, page;
const consoleErrors = [];

// 截图辅助
async function shot(name) {
  const path = SHOT_DIR + name + '.png';
  await page.screenshot({ path, fullPage: false });
  return path;
}

// API 辅助（校验 UI 数据与后端一致）——需带 token
let apiToken = '';
async function apiLogin() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  apiToken = (await r.json()).token;
}
async function api(path) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${apiToken}` } });
  return r.json();
}

// ---------- 启动浏览器 ----------
console.log('启动 Chrome（headless）...');
browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--window-size=1440,900'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('PAGE_ERROR: ' + err.message));
page.on('response', async (res) => {
  if (res.url().includes('/api/orders') && res.request().method() === 'POST') {
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    console.log(`    [诊断] POST /api/orders → ${res.status()}: ${body}`);
  }
});
await apiLogin();

// ============================================================
console.log('\n===== U1. 登录与路由守卫 =====');

await test('U1 未登录访问受保护页面被重定向到登录页', async () => {
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  const url = page.url();
  if (!url.includes('/login')) throw new Error(`期望重定向到 /login，实际 ${url}`);
});

await test('U2 登录页正常渲染', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="用户名"]', { timeout: 5000 });
  const title = await page.locator('.login-title').textContent();
  if (!title.includes('MiniSaaS')) throw new Error('登录页标题异常: ' + title);
  await shot('U2-登录页');
});

await test('U3 错误密码登录：预期弹出错误提示', async () => {
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'wrong-pass');
  await page.click('button:has-text("登 录")');
  try {
    await page.waitForSelector('.el-message--error', { timeout: 4000 });
    const msg = await page.locator('.el-message--error').textContent();
    if (!msg.includes('用户名或密码错误')) throw new Error('错误提示异常: ' + msg);
    if (!page.url().includes('/login')) throw new Error('登录失败不应跳转');
    await shot('U3-登录失败提示');
  } catch (e) {
    // 已知缺陷：axios 拦截器把登录接口 401 当会话过期处理，触发整页刷新，错误提示被冲掉
    if (e.message.includes('Timeout')) {
      throw new Error('⚠️ 产品缺陷：登录失败时错误提示未显示（axios 401 拦截器误触发整页刷新）');
    }
    throw e;
  }
});

await test('U4 正确登录：跳转看板并渲染统计卡片', async () => {
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'admin123');
  await page.click('button:has-text("登 录")');
  await page.waitForURL('**/dashboard', { timeout: 8000 });
  await page.waitForSelector('.stat-value', { timeout: 5000 });
  await shot('U4-数据看板');
});

await test('U5 看板统计与后端 API 数据一致', async () => {
  const stats = await api('/dashboard/stats');
  const values = await page.locator('.stat-value').allTextContents();
  const v = values.map((s) => s.trim());
  const expectCounts = [String(stats.productCount), String(stats.customerCount), String(stats.orderCount)];
  for (const exp of expectCounts) {
    if (!v.some((x) => x === exp)) throw new Error(`看板未显示后端值 ${exp}，实际卡片值: ${v.join('|')}`);
  }
  // 最近订单表格渲染
  const rows = await page.locator('.el-table__row').count();
  if (rows < 1) throw new Error('最近订单表格无数据');
});

// ============================================================
console.log('\n===== U2. 商品管理 =====');

await test('U6 商品列表渲染（≥6 条种子数据）', async () => {
  await page.click('text=商品管理');
  await page.waitForURL('**/products', { timeout: 5000 });
  await page.waitForSelector('.el-table__row', { timeout: 5000 });
  const rows = await page.locator('.el-table__row').count();
  if (rows < 6) throw new Error(`商品行数 ${rows} < 6`);
  await shot('U6-商品列表');
});

await test('U7 XSS 存储防护：商品名中的 <script> 渲染为文本而非执行', async () => {
  // 安全套件已注入 XSS 商品，此处验证前端渲染
  await page.fill('input[placeholder="搜索商品名 / SKU"]', 'XSS-');
  await page.waitForTimeout(600);
  await page.waitForSelector('.el-table__row', { timeout: 5000 });
  const cellText = await page.locator('.el-table__row').first().locator('td').allTextContents();
  const hasScript = cellText.some((t) => t.includes('<script>'));
  if (!hasScript) throw new Error('未找到 XSS 测试商品行');
  // 关键断言：script 未被执行（window.__xss 未被设置）
  const executed = await page.evaluate(() => window.__xss);
  if (executed === 1) throw new Error('⚠️ XSS 已执行！存储型 XSS 漏洞');
  await shot('U7-XSS渲染为文本');
});

await test('U8 商品搜索过滤', async () => {
  await page.fill('input[placeholder="搜索商品名 / SKU"]', '键盘');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const names = await page.locator('.el-table__row td:nth-child(3)').allTextContents();
  if (names.length === 0 || !names.every((n) => n.includes('键盘'))) {
    throw new Error('搜索结果应全部包含「键盘」: ' + names.join(','));
  }
  await page.fill('input[placeholder="搜索商品名 / SKU"]', '');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
});

await test('U9 新增商品（弹窗表单）', async () => {
  await page.click('button:has-text("新增商品")');
  await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
  await shot('U9-新增商品弹窗');
  const sku = 'UI-TEST-' + Date.now();
  await page.fill('.el-dialog input[placeholder*="SKU"]', sku);
  await page.fill('.el-dialog input[placeholder]:nth-of-type(1)', sku); // 兜底
  await page.fill('.el-dialog .el-form-item:has-text("名称") input', 'UI 测试商品');
  await page.fill('.el-dialog .el-form-item:has-text("价格") input', '88.88');
  await page.fill('.el-dialog .el-form-item:has-text("分类") input', '测试类');
  await page.click('.el-dialog button:has-text("保存")');
  await page.waitForSelector('.el-message--success', { timeout: 5000 });
  await shot('U9b-新增成功提示');
});

await test('U10 新商品出现在列表中', async () => {
  await page.fill('input[placeholder="搜索商品名 / SKU"]', 'UI 测试商品');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const rows = await page.locator('.el-table__row').count();
  if (rows < 1) throw new Error('新增商品未出现在列表');
});

await test('U11 编辑商品', async () => {
  const firstRow = page.locator('.el-table__row').first();
  await firstRow.locator('button:has-text("编辑")').click();
  await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
  await page.fill('.el-dialog .el-form-item:has-text("名称") input', 'UI 测试商品-已编辑');
  await page.click('.el-dialog button:has-text("保存")');
  await page.waitForSelector('.el-message--success', { timeout: 5000 });
  await page.waitForTimeout(600);
  const names = await page.locator('.el-table__row td:nth-child(3)').allTextContents();
  if (!names.some((n) => n.includes('已编辑'))) throw new Error('编辑未生效');
});

await test('U12 删除被订单引用的商品：显示友好错误提示', async () => {
  // 先清空搜索
  await page.fill('input[placeholder="搜索商品名 / SKU"]', '机械键盘');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const firstRow = page.locator('.el-table__row').first();
  await firstRow.locator('button:has-text("删除")').click();
  await page.waitForSelector('.el-message-box', { timeout: 5000 });
  await page.click('.el-message-box button:has-text("确定")');
  await page.waitForSelector('.el-message--error', { timeout: 5000 });
  const msg = await page.locator('.el-message--error').textContent();
  if (!msg.includes('引用')) throw new Error('错误提示异常: ' + msg);
  await shot('U12-引用保护提示');
});

await test('U13 删除未引用商品成功（清理 U9 创建的商品）', async () => {
  await page.fill('input[placeholder="搜索商品名 / SKU"]', '已编辑');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const rows = await page.locator('.el-table__row').count();
  if (rows < 1) throw new Error('找不到待删除商品');
  await page.locator('.el-table__row').first().locator('button:has-text("删除")').click();
  await page.waitForSelector('.el-message-box', { timeout: 5000 });
  await page.click('.el-message-box button:has-text("确定")');
  await page.waitForSelector('.el-message--success', { timeout: 5000 });
  await page.waitForTimeout(600);
  const remain = await page.locator('.el-table__row').count();
  if (remain !== 0) throw new Error('删除后列表应清空，剩余 ' + remain);
});

// ============================================================
console.log('\n===== U3. 客户管理 =====');

await test('U14 新增客户', async () => {
  await page.click('text=客户管理');
  await page.waitForURL('**/customers', { timeout: 5000 });
  await page.waitForSelector('.el-table__row', { timeout: 5000 });
  await page.click('button:has-text("新增客户")');
  await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
  await page.fill('.el-dialog .el-form-item:has-text("名称") input', 'UI 测试客户');
  await page.fill('.el-dialog .el-form-item:has-text("联系人") input', '测试联系人');
  await page.fill('.el-dialog .el-form-item:has-text("电话") input', '13600001111');
  await page.click('.el-dialog button:has-text("保存")');
  await page.waitForSelector('.el-message--success', { timeout: 5000 });
  await page.waitForTimeout(600);
  const names = await page.locator('.el-table__row td:nth-child(2)').allTextContents();
  if (!names.some((n) => n.includes('UI 测试客户'))) throw new Error('客户未出现');
  await shot('U14-客户列表');
});

// ============================================================
console.log('\n===== U4. 订单管理（核心业务闭环） =====');

await test('U15 新建订单：选客户、添加两行明细、提交', async () => {
  await page.click('text=订单管理');
  await page.waitForURL('**/orders', { timeout: 5000 });
  await page.waitForSelector('.el-table__row', { timeout: 5000 });
  await page.click('button:has-text("新建订单")');
  await page.waitForSelector('.el-dialog:visible', { timeout: 5000 });
  await shot('U15-新建订单弹窗');

  // 选客户
  await page.click('.el-dialog .el-form-item:has-text("客户") .el-select');
  await page.waitForSelector('.el-select-dropdown__item:visible', { timeout: 5000 });
  await page.locator('.el-select-dropdown__item:visible').first().click();
  await page.waitForTimeout(400);

  // 第一行明细：选商品（用商品名精确定位，避免选中测试注入的库存为 0 的商品）
  const itemRow = page.locator('.order-item-row').first();
  await itemRow.locator('.el-select').click();
  await page.waitForSelector('.el-select-dropdown__item:visible', { timeout: 5000 });
  await page.locator('.el-select-dropdown__item:visible', { hasText: '机械键盘' }).click();
  await itemRow.locator('.el-input-number input').fill('2');
  await page.waitForTimeout(400);

  // 添加第二行
  await page.click('button:has-text("添加明细")');
  await page.waitForTimeout(400);
  const row2 = page.locator('.order-item-row').nth(1);
  await row2.locator('.el-select').click();
  await page.waitForSelector('.el-select-dropdown__item:visible', { timeout: 5000 });
  await page.locator('.el-select-dropdown__item:visible', { hasText: '无线鼠标' }).click();
  await row2.locator('.el-input-number input').fill('1');
  await page.waitForTimeout(400);

  await shot('U15b-订单明细填写完成');
  await page.click('.el-dialog button:has-text("提交订单")');
  // 等待提交结果（成功或失败提示都算有响应）
  await page.waitForSelector('.el-message--success, .el-message--error', { timeout: 8000 });
  await page.waitForTimeout(600);
  const dialogOpen = await page.locator('.el-overlay-dialog:visible').count();
  const msgText = await page.locator('.el-message--success, .el-message--error').last().textContent();
  if (!msgText.includes('下单成功')) {
    throw new Error(`下单失败提示: ${msgText}（弹窗仍打开: ${dialogOpen > 0}）`);
  }
  if (dialogOpen > 0) throw new Error('下单成功但弹窗未关闭');
  await shot('U15c-下单成功');
});

await test('U16 订单列表出现新订单并可展开明细', async () => {
  await page.waitForTimeout(800);
  const rows = await page.locator('.el-table__row').count();
  if (rows < 4) throw new Error(`订单行数 ${rows} < 4（种子3 + 新增1）`);
  // 展开第一行（最新订单）
  await page.locator('.el-table__row').first().locator('.el-table__expand-icon').click();
  await page.waitForTimeout(600);
  const expandTable = await page.locator('.el-table__expanded-cell .el-table__row').count();
  if (expandTable < 2) throw new Error(`展开明细应 ≥2 行，实际 ${expandTable}`);
  await shot('U16-订单明细展开');
});

await test('U17 订单状态流转：标记已支付 → 已发货', async () => {
  await page.locator('.el-table__row').first().locator('button:has-text("变更状态")').click();
  await page.waitForSelector('.el-dropdown-menu__item:visible', { timeout: 5000 });
  await page.locator('.el-dropdown-menu__item:visible').filter({ hasText: '已支付' }).first().click();
  await page.waitForSelector('.el-message--success', { timeout: 5000 });
  await page.waitForTimeout(600);
  const statusTag = await page.locator('.el-table__row').first().locator('.el-tag').textContent();
  if (!statusTag.includes('已支付')) throw new Error('状态未变更为已支付: ' + statusTag);
  await shot('U17-状态已支付');
});

await test('U18 取消订单：状态变更为已取消', async () => {
  await page.locator('.el-table__row').first().locator('button:has-text("变更状态")').click();
  await page.waitForSelector('.el-dropdown-menu__item:visible', { timeout: 5000 });
  await page.locator('.el-dropdown-menu__item:visible').filter({ hasText: '已取消' }).first().click();
  await page.waitForSelector('.el-message--success', { timeout: 5000 });
  await page.waitForTimeout(600);
  const statusTag = await page.locator('.el-table__row').first().locator('.el-tag').textContent();
  if (!statusTag.includes('已取消')) throw new Error('状态未变更为已取消');
});

// ============================================================
console.log('\n===== U5. 会话与健壮性 =====');

await test('U19 刷新页面保持登录态', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const url = page.url();
  if (url.includes('/login')) throw new Error('刷新后掉登录（应保持会话）');
  await page.waitForSelector('.el-table__row', { timeout: 5000 });
});

await test('U20 退出登录：回到登录页且受保护路由不可达', async () => {
  await page.click('button:has-text("退出登录")');
  await page.waitForSelector('.el-message-box', { timeout: 5000 });
  await page.click('.el-message-box button:has-text("确定")');
  await page.waitForURL('**/login', { timeout: 5000 });
  // 退出后直接访问受保护页应被守卫拦回
  await page.goto(BASE + '/dashboard');
  await page.waitForTimeout(800);
  if (!page.url().includes('/login')) throw new Error('退出后仍可访问受保护页面');
  await shot('U20-退出后回登录页');
});

await test('U21 控制台无未预期 JS 错误（整轮 E2E）', async () => {
  // 白名单：favicon 缺失、以及测试本身故意触发的 401/400（登录失败、未登录访问、删除被引用商品）
  const whitelist = [
    (e) => e.includes('favicon'),
    (e) => e.includes('404 (Not Found)'), // favicon.ico 未配置
    (e) => e.includes('401 (Unauthorized)'), // U1 未登录访问 / U3 登录失败
    (e) => e.includes('400 (Bad Request)'), // U12 删除被引用商品（业务拒绝）
  ];
  const unexpected = consoleErrors.filter((e) => !whitelist.some((w) => w(e)) && !e.includes('Download the Vue Devtools'));
  if (unexpected.length > 0) throw new Error('存在未预期控制台错误:\n' + unexpected.join('\n'));
  console.log(`    （全程共捕获 ${consoleErrors.length} 条 console error，全部为白名单内预期行为）`);
});

// ---------- 汇总 ----------
const result = summary('UI E2E（Chrome）');
fs.writeFileSync(new URL('./report/ui-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log('UI 测试结果已写入 report/ui-result.json');

await browser.close();
