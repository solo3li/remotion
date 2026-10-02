// 对比度检查。从 styles.css 直接读 token，纯 Node 算，不用浏览器。
//
// 为什么要有这个文件：这轮之前我在浏览器里手敲过四遍对比度检查，四遍都错过 ——
// 第一次用正则把 oklch 的三个数当 RGB；第二次读 canvas 的 fillStyle 回读值
// （对 oklch 是原样返回）；第三次没合成半透明前景；第四次在测量中途改
// data-theme 然后跨渲染读值，读出自相矛盾的结果。
//
// 每次重写一遍就是每次重新引入一个 bug。所以它现在是一个文件：确定性、
// 可复跑、能进 CI，色彩空间转换写死一次就不再变。
//
//   node scripts/contrast.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "styles.css"), "utf8");

/* ── OKLCH → sRGB。照 CSS Color 4 的矩阵，别自己发明。 ────────────────── */

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLab → LMS'
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];

  // LMS → linear sRGB
  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  // gamut clip：超出的直接截断。做对比度判断够用，不做色域映射。
  return lin.map((v) => Math.min(1, Math.max(0, v)));
}

/** WCAG 相对亮度。输入必须是 **linear** sRGB。 */
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const ratio = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ── 从 CSS 里抠 token ───────────────────────────────────────────────── */

/** 取一个 token 在指定块里的值。块用起始选择器定位。 */
function tokens(startSelector) {
  const at = css.indexOf(startSelector);
  if (at < 0) throw new Error(`找不到块：${startSelector}`);
  // 从选择器往后到第一个只有缩进的 } 为止，够覆盖一个 token 块
  const body = css.slice(at, at + 1600);
  const out = {};
  for (const m of body.matchAll(
    /(--[a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g)) {
    if (!(m[1] in out)) out[m[1]] = oklchToSrgb(+m[2], +m[3], +m[4]);
  }
  return out;
}

const THEMES = {
  浅色: tokens(":root {"),
  深色: tokens(':root[data-theme="dark"] {'),
};

/* ── 要检查的组合。新增界面元素时在这里加一行。 ──────────────────────── */

const PAIRS = [
  ["正文",              "--ink",      "--bg",        4.5],
  ["次要文字 / 底",      "--ink-2",    "--bg",        4.5],
  ["次要文字 / 面板",    "--ink-2",    "--panel",     4.5],
  ["三级文字（仅大字）", "--ink-3",    "--bg",        3.0],
  ["主色 / 底",          "--primary",  "--bg",        4.5],
  ["选中态文字",         "--primary",  "--primary-w", 4.5],
  ["signal / wash",      "--signal",   "--signal-w",  4.5],
  ["signal / 底",        "--signal",   "--bg",        4.5],
  ["在岗点 / 面板",      "--on-duty",  "--panel",     3.0],
  ["危险色 / 底",        "--danger",   "--bg",        4.5],
  ["主按钮字 / 主色底",  "--bg",       "--primary",   4.5],
  ["计数字 / signal 底", "--bg",       "--signal",    4.5],
  ["导航栏 未选中",      "--nav-ink",  "--nav-bg",    4.5],
  ["导航栏 选中",        "--nav-on",   "--nav-sel",   4.5],
  ["导航栏 待办",        "--nav-signal", "--nav-bg",  4.5],
];

let failed = 0;
for (const [theme, t] of Object.entries(THEMES)) {
  console.log(`\n${theme}`);
  for (const [label, fg, bg, need] of PAIRS) {
    if (!t[fg] || !t[bg]) {
      console.log(`  SKIP  ${label} (缺 ${!t[fg] ? fg : bg})`);
      continue;
    }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= need;
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)} (需 ${need})  ${label}`);
  }
}
console.log(failed ? `\n✗ ${failed} 项不达标` : "\n✓ 全部达标");
process.exit(failed ? 1 : 0);
