# services/api — AgentPulse 后端（dsh 重建版）

> 旧版（Hermes 运行时，25k 行 + 47 张表）已在 `claude/dsh-rebuild` 分支删除。
> 需要参考旧实现：`git show main:services/api/app/...`

## 现状

只有运行时种子。P0 已验证 dsh 可用（见 [ADR 0019](../../docs/decisions/0019-dsh-as-agent-runtime.md)）。

```
app/main.py                            启动入口：装配落库/总线/dsh/HTTP
app/api.py                             HTTP 层：桥端点 + 三端接口 + SSE
app/bus.py                             进程内两条总线：等老板回答、推给三端
app/db.py                              10 张表的 schema（只支持 SQLite，故意的）
app/store.py                           公司事实的读写。薄 SQL，无 ORM
app/rooms.py                           房间：共享 transcript + 发言路由（不碰 HTTP/DB/dsh）
app/runtime/
  dsh_client.py                        DshBackend —— 一次 Run → AgentEvent 流
  employee_turn.py                     房间 ↔ dsh 的唯一接缝
  composition/employee.cordis.yml      一个员工的 dsh 组装（模板）
  composition/agentpulse-bridge.mjs    人机桥（问答 provider + 审批 answerer）
tests/test_rooms.py                    房间：19 例纯函数，0.02s
tests/test_dsh_backend.py              运行时 + 人机桥
tests/test_store.py                    落库：schema 约束 + 重启续跑
tests/test_api.py                      HTTP：桥往返 + SSE（SSE 用真 uvicorn）
tests/test_room_e2e.py                 两个真员工的真讨论
```

## 跑起来

```bash
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
```

结构校验（不花钱）：

```bash
PYTHONPATH=. ./.venv/bin/python -m pytest tests/ -v
```

真跑 dsh（要 `DEEPSEEK_API_KEY`，会真调 API）：

```bash
PYTHONPATH=. DSH_E2E=1 ./.venv/bin/python -m pytest tests/ -v
```

## 下一步

P1 的一条闭环：拉群 → 讨论对齐 → 共识 brief → 老板拍板 → 一个员工真执行 → 结果回群。
出口物是 macOS dmg + `v0.1.0` Release。

后端完整了（[ADR 0025](../../docs/decisions/0025-http-layer.md)）。真跑起来：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8787
```

`--host 0.0.0.0` 是为了手机能从局域网连进来 —— 三端同源在 P1 靠这个。

前端在 [`apps/app`](../../apps/app)（Vite + React）。同时起两个：

```bash
npm run dev --prefix apps/app
```

桌面壳在 [`apps/desktop`](../../apps/desktop)：

```bash
NODE_USE_ENV_PROXY=1 npm run pack --prefix apps/desktop
```

（`NODE_USE_ENV_PROXY=1` 是必须的 —— Node 的 undici fetch 默认不认 `HTTP_PROXY`，
Electron 的下载器会直接 `fetch failed`。）

## 不许做（ADR 0019 硬约束）

- 不用 `experimental/agent-team` 替代自研群讨论协议（ADR 0002）。
- 不把 UnitPulse 路径隔离检查外包给 dsh sandbox（ADR 0005）。
- 不指望 `dsh-schedule` 做 7×24；调度权在我们侧（ADR 0003）。
- 不在对话中途换员工工具集（`recompose()` 只对未产出内容的 agent 有效）。
