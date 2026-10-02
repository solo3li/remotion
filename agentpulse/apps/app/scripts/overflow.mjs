// 横向溢出检查。CSS 里静态查那些必然导致溢出的写法。
//
// 为什么要有这个：flex 和 grid 的子项默认 min-width/min-content 是 auto，
// 长文本会把容器撑破，而 `overflow: hidden` 只是把它裁掉 —— 看不见，
// 布局仍然是错的。我第一版就是那么"修"的，实测还溢出 610px。
//
// 静态检查抓的是**写法**：设了 ellipsis 却没给 min-width:0 的 flex 子项，
// 以及没写列定义的 grid 容器。真实几何仍需在浏览器里量。
//
//   node scripts/overflow.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "styles.css"), "utf8");

/** 粗解析成 { selector, body } 列表。够用 —— 不是要写 CSS 解析器。 */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, sel, body]) => ({ sel: sel.trim().replace(/\s+/g, " "), body }))
  .filter((r) => !r.sel.startsWith("@") && !r.sel.startsWith("/*"));

const has = (body, prop) => new RegExp(`(^|[;{\\s])${prop}\\s*:`).test(body);

const problems = [];

for (const { sel, body } of rules) {
  // ① 设了省略号却没给 min-width:0 —— flex/grid 子项上省略号不会生效
  if (has(body, "text-overflow") && /ellipsis/.test(body) && !has(body, "min-width")) {
    problems.push(`${sel} —— 有 ellipsis 但没有 min-width:0`);
  }
  // ② grid 容器没写列定义：默认 auto = max-content，最长内容撑破容器
  if (/display\s*:\s*grid/.test(body) && !has(body, "grid-template-columns")
      && !has(body, "grid-template") && !has(body, "grid-auto-flow")) {
    problems.push(`${sel} —— display:grid 但没有列定义（默认 max-content 会撑破）`);
  }
}

if (problems.length) {
  console.log("可能横向溢出：");
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`\n${problems.length} 处。加 min-width:0，或把列定义写成 minmax(0, 1fr)。`);
  process.exit(1);
}
console.log("✓ 没有已知的溢出写法");
