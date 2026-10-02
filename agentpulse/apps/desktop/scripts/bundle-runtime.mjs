// 把一份**自包含**的 Python 运行时装进 build/runtime，让 dmg 在干净 Mac 上也能跑。
//
// 为什么不用 venv：venv 不带 stdlib —— pyvenv.cfg 指回创建它的那个 base Python，
// 从那里读 stdlib。装到没有 Python 3.12 的机器上直接起不来。这一条是真验过的：
// 第一版就是 venv，`sys.path` 里的 stdlib 全指向 /Library/Frameworks/...。
//
// 换成 python-build-standalone 的 `install_only` 构建：自带 stdlib、可重定位。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, "..", "build");
const out = join(buildDir, "runtime");
const reqs = resolve(here, "..", "..", "..", "services", "api", "requirements.txt");

// 固定版本，不追 latest —— 构建产物要可复现。升级时改这三行并重跑。
const PY = "3.12.14";
const TAG = "20260814";
const ASSET = `cpython-${PY}+${TAG}-aarch64-apple-darwin-install_only.tar.gz`;
const URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${TAG}/${ASSET}`;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...opts });

mkdirSync(buildDir, { recursive: true });
const tarball = join(buildDir, ASSET);

if (!existsSync(tarball)) {
  console.log(`[runtime] 下载便携 CPython ${PY}`);
  // 用 curl 而不是 fetch：Node 的 undici fetch 默认不认 HTTP_PROXY，
  // 在代理后面会直接 "fetch failed"（Electron 的下载器踩过同一个坑，
  // 那边要靠 NODE_USE_ENV_PROXY=1）。curl 认 env 代理，省事。
  run("curl", ["-fL", "--retry", "3", "-o", tarball, URL]);
}
console.log(`[runtime] sha256 ${createHash("sha256").update(readFileSync(tarball)).digest("hex").slice(0, 16)}…`);

if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });
// 压缩包里顶层是 python/，剥掉它
run("tar", ["-xzf", tarball, "-C", out, "--strip-components", "1"]);

const python = join(out, "bin", "python3");
console.log("[runtime] 装依赖（含 195MB 的 dsh 运行时，会慢）");
run(python, ["-m", "pip", "install", "--quiet", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "--quiet", "-r", reqs]);

// 测试依赖不进包
for (const drop of ["pytest", "pytest-asyncio", "httpx"]) {
  try { run(python, ["-m", "pip", "uninstall", "-y", "-q", drop]); } catch { /* 本来就没装 */ }
}

// 自检：**必须**自带 stdlib、不能依赖包外的任何路径。
// 这是这个脚本存在的全部理由，所以在这里断言，而不是等打包后才发现。
const probe = `
import json, sys, pathlib
inside = str(pathlib.Path(sys.prefix).resolve())
outside = [p for p in sys.path if p and not str(pathlib.Path(p).resolve()).startswith(inside)]
import fastapi, uvicorn, deepseek_harness   # noqa: F401
print(json.dumps({"version": sys.version.split()[0],
                  "base_prefix": sys.base_prefix, "prefix": sys.prefix,
                  "outside": outside}))
`;
const report = JSON.parse(
  execFileSync(python, ["-c", probe], { encoding: "utf8" }).trim().split("\n").pop(),
);
if (report.outside.length) {
  console.error("[runtime] ✗ sys.path 指向包外，装到干净机器上会起不来：", report.outside);
  process.exit(1);
}
if (report.base_prefix !== report.prefix) {
  console.error("[runtime] ✗ base_prefix 不等于 prefix，这还是个 venv：", report);
  process.exit(1);
}
writeFileSync(join(buildDir, "runtime.json"),
              JSON.stringify({ python: PY, tag: TAG, ...report }, null, 2));
console.log(`[runtime] ✓ 自包含 Python ${report.version}，sys.path 全在包内`);
