// 打包前构建前端，并断言产物存在。
//
// 为什么要有这个：electron-builder 的 extraResources 指向一个不存在的目录时
// **不报错、不警告、exit 0** —— 我因此打出过一个没有界面的 dmg，装上去窗口
// 全白、/app/ 返回 404。构建产物必须由打包流程自己生成并检查，不能靠它「碰巧还在」。

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "..", "..", "app");
const dist = join(web, "dist");

if (existsSync(dist)) rmSync(dist, { recursive: true });

console.log("[web] 构建前端（base=/app/，API 同源）");
execFileSync("npm", ["run", "build"], {
  cwd: web,
  stdio: "inherit",
  // 桌面壳里前端由后端在 /app 下同源伺服 —— 见 ADR 0027
  env: { ...process.env, VITE_BASE: "/app/", VITE_API_BASE: "" },
});

const index = join(dist, "index.html");
if (!existsSync(index)) {
  console.error("[web] ✗ 没有产出 dist/index.html");
  process.exit(1);
}
const html = readFileSync(index, "utf8");
if (!html.includes("/app/assets/")) {
  console.error("[web] ✗ 资源路径不是 /app/ —— 装进壳里会 404。实际内容：");
  console.error(html.match(/(src|href)="[^"]*"/g)?.join("\n") ?? html.slice(0, 200));
  process.exit(1);
}
console.log("[web] ✓ 产物就绪，资源路径带 /app/");
