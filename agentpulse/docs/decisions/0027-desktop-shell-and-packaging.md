# ADR 0027 — 桌面壳与 dmg 打包

- 日期：2026-08-22
- 状态：已实现（dmg 已产出并从安装态验过）
- 依赖：[ADR 0021](0021-employee-workstation-and-resource-leases.md)（零服务器 / 三端）、[ADR 0025](0025-http-layer.md)（HTTP + SSE）、[ADR 0026](0026-frontend-design-system.md)（前端）

## 决策一：前端由后端同源伺服，壳只连 127.0.0.1

FastAPI 在 `/app` 下挂 `StaticFiles`，Electron 加载 `http://127.0.0.1:8787/app/`。因此**没有 proxy、没有 CORS、没有 preload 桥、没有 `file://` 特例**，渲染进程也不需要 Node（`nodeIntegration: false`、`sandbox: true`）。

一处代码三种形态，靠构建期注入区分：

| 形态 | `VITE_BASE` | `VITE_API_BASE` |
|---|---|---|
| 开发 | `/` | `/api`（vite proxy） |
| 桌面壳 | `/app/` | 空（同源） |
| 局域网手机 | 同桌面 | 同桌面（连 Mac 的地址） |

## 决策二：随包 Python 必须自包含 —— venv 不行

第一版用 `python -m venv --copies`。装到新路径确实能跑，**但那是假通过**：venv 不带 stdlib，`pyvenv.cfg` 指回创建它的 base Python。实测 `sys.path` 里的 stdlib 全指向 `/Library/Frameworks/Python.framework/Versions/3.12` —— 我这台机器有，干净 Mac 没有。

换成 [python-build-standalone](https://github.com/astral-sh/python-build-standalone) 的 `install_only` 构建（自带 stdlib、可重定位），版本**固定**不追 latest，保证产物可复现。

打包脚本里有硬断言，跑不过就退出：`sys.path` 不得有任何包外路径，且 `base_prefix == prefix`（否则说明还是个 venv）。**这个断言就是脚本存在的全部理由**，所以在打包时就查，不等装到别人机器上才发现。

## 决策三：后端出问题绝不能让 app 关不掉

退出时先 SIGTERM，**6 秒后强杀整个进程组**（`kill(-pid)`，连 dsh 子进程一起收）。后端子进程 `detached: true` 自成进程组。

为什么必须有兜底：员工那一轮跑在 `asyncio.to_thread` 里，而 **`to_thread` 不可取消**。如果它正阻塞在桥的 HTTP 等待上（老板还没回答），没有任何优雅手段能把它拽回来。

## 打包验收踩到的四个真问题

1. **首次运行是死路。** 装完启动，空状态叫你「先招一个员工」，点下去返回 `400 还没有公司`。加了 `store.bootstrap()`：首启建公司、老板，并按主机名注册这台设备，幂等。**开箱即用意味着开箱那一刻就有一家公司。**
2. **关闭死锁（我自己写反了顺序）。** lifespan 里我把 `asks.cancel_all()` 放在 `gather(*live)` **之后** —— 而那些任务正卡在不可取消的线程里等桥返回，gather 永远等不到。必须**先**唤醒桥等待者，再取消任务，且 gather 要有超时上限。
3. **重启留下孤儿 ask。** AskBus 是进程内的，重启后没有任何桥还在等 —— 遗留的 `pending` 只会让老板对着空气回答。启动时全部标 `expired`（真跑时侧栏堆了三条一模一样的孤儿）。
4. **Electron 二进制下不下来。** `fetch failed`，而同一个 URL 用 curl 是 200。原因：Node 22 的 undici fetch **默认不认 `HTTP_PROXY`**。解法 `NODE_USE_ENV_PROXY=1`；打包脚本里改用 curl 下载，绕开同一个坑。

## 验收对照 P1 闸门

| 闸门条目 | 状态 |
|---|---|
| dmg 产出 | ✅ `AgentPulse-0.1.0-arm64.dmg`，179 MB |
| 装到新路径后自包含 | ✅ 便携 Python 3.12.14，`sys.path` 零包外路径 |
| 后端从包内启动并伺服前端 | ✅ `/health` `/app/` 都 200，跑的是包内 python |
| 界面加载并连上 SSE | ✅ `/health` 报 `subscribers: 1` |
| 从零招人 → 开房间 → 员工真回话 | ✅ 用的是**包内** dsh 运行时（进程路径已核对） |
| 员工经 `ask_user_question` 真问到人 | ✅ 三个选项的问答卡片 |
| 局域网可达（手机走这条） | ✅ `http://<mac-ip>:8787/app/` 200 |
| 退出零残留 | ✅ 8 秒，员工正阻塞等待时也干净 |
| **干净 Mac** | ❌ 见下 |
| **v0.1.0 Release** | ❌ 未 push |
| **录屏** | ❌ 未做 |

## 未做 / 已知缺口（别当闸门已过）

1. **没有 BYOK 界面 —— 这是「干净 Mac」剩下的唯一硬障碍。** 后端从环境变量读 `DEEPSEEK_API_KEY`，我这边是从带 key 的 shell 里启动的。真实用户装完打开，**没有任何地方能填 key**。这一条不补，闸门第一条就不能算过。
2. **优雅退出仍然走不通。** 8 秒说明是 6 秒兜底强杀生效的。桥阻塞态下的 dsh 一轮，目前没有优雅回收路径。
3. **没有代码签名 / 公证。** 别人下载会被 Gatekeeper 拦。
4. **没有应用图标**（用的 Electron 默认图标）。
5. **只有 macOS arm64。** Intel Mac 和 Windows 见 [ADR 0026](0026-frontend-design-system.md) / 蓝图第八节。
6. 手机端只在浏览器改视口验过，没在真手机上装 PWA 试。
