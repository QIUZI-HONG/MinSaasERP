// 极简测试框架（零依赖）：通过/失败/观察项三类记录，输出统计
const results = [];
const observations = [];

export async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, pass: true, ms: Date.now() - start });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (e) {
    results.push({ name, pass: false, error: e.message, ms: Date.now() - start });
    console.log(`  ❌ ${name} — ${e.message}`);
  }
}

// 观察项：不判成败，记录实际行为（用于发现非预期但未崩溃的行为）
export function observe(msg) {
  observations.push(msg);
  console.log(`  👀 观察: ${msg}`);
}

export function summary(suite) {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\n[${suite}] 通过 ${passed}/${results.length}，失败 ${failed}，观察项 ${observations.length}`);
  return { suite, total: results.length, passed, failed, observations: [...observations], cases: results };
}
