# ADR 0024 — 公司事实落 SQLite，10 张表

- 日期：2026-08-22
- 状态：已实现
- 依赖：[ADR 0021](0021-employee-workstation-and-resource-leases.md)（工位 / 租约）、[ADR 0022](0022-human-bridge.md)（人机桥）、[ADR 0023](0023-room-rules.md)（房间）

## 决策一：只支持 SQLite

P1 零服务器、单机（ADR 0021），不需要 PostgreSQL。旧版 `core/database.py` 有 2,026 行，其中一大块是 sqlite/postgres 的 `?`→`%s` 占位符转换（还得避开字符串字面量里的 `?`）—— **整块不需要了**。

P3 上服务器时再评估。届时表已经稳定，换驱动不动模型。

三条 PRAGMA 是必需的，不是调优：
- `journal_mode=WAL` —— 房间在写的时候三端还要能读。
- `foreign_keys=ON` —— **SQLite 默认关闭外键**，不开等于 schema 里那些 `REFERENCES` 是注释。有测试盯着。
- `busy_timeout` —— 多客户端并发读写。

## 决策二：10 张表，员工记忆不在其中

| 表 | 存什么 |
|---|---|
| `workspaces` `users` | 公司与老板 |
| `devices` | 注册过的设备（本机员工的工位指向这里） |
| `agents` | 员工：人格、工位、dsh 账本目录与最近 session |
| `conversations` `conversation_members` `messages` | 房间、参与者、transcript |
| `asks` | 等老板拍板的事 |
| `runs` | dsh Run 的投影（"谁在忙什么"） |
| `resource_leases` | 资源租约 |

**员工的记忆和履历不在这里** —— 那是 dsh 的 session 账本（ADR 0019）。旧版建了 `agent_memories` / `agent_experiences` / `context_manifests` / `memory_links` / `run_steps` 五张表，那是在 Hermes 外面重造 Hermes 没给的东西。47 张 → 10 张，主要就是砍掉这一类。

`asks` 一张表同时装问答和拍板，**因为它们是同一条链**（ADR 0022），用 `kind` 区分。不为对称而拆成两张。

## 决策三：约束写进 schema，不靠应用层自觉

两条关键不变量由数据库强制，因为"应用层记得检查"在多入口（Mac / 手机 / 将来的云）下必然漏：

1. **工位不可变** —— `BEFORE UPDATE` trigger，改 `workstation` 或 `device_id` 直接 `RAISE(ABORT)`。ADR 0021 说工位漂移是 split brain 的唯一入口，所以这条必须是硬的。配套两个 CHECK：本机员工必须有设备、云员工必须没有。
2. **独占租约唯一** —— 部分唯一索引 `WHERE mode='exclusive' AND released_at IS NULL`。一台机器只有一套鼠标键盘，靠索引挡，不靠应用层。

`answer_ask` 只更新 `status='pending'` 的行并返回 rowcount —— 手机和 Mac 同时点提交，第二次会失败而不是把已决的事改掉。

## 验证

`tests/test_store.py` —— **14 passed，0.23s**，真 SQLite 临时文件，不 mock（要测的正是 schema 约束）：

- 外键真的开着（往不存在的 workspace 里招人会被拒）
- 本机员工没设备被拒 / 云员工带设备被拒
- **工位不可变的 trigger 真的拦住 UPDATE**，且不可变的只有工位（`session_id` 仍可更新 —— 别把整行锁死）
- 独占租约第二个持有者被挡；释放后可再获取；**不同 worktree 不互相冲突**（这是 ADR 0021 允许并行的核心机制）
- 拉人进群记录了是谁拉的、为什么；离开的成员从房间里消失
- `asks` 只能被回答一次
- **`test_discussion_resumes_after_restart`** —— 讨论跑两轮、`conn.close()` 模拟进程死掉、重开库、从落下来的 transcript 接着跑第三轮。断言历史没被改写。这是落库这一步存在的唯一理由。

全套 **39 passed**（含真 dsh e2e）。

## 待验证

1. WAL 下三端并发读 + 房间写的真实表现（P1 接上 HTTP 后压一次）。
2. 长 transcript（数百条）的 `load_transcript` 是否需要分页 —— 目前全量读。
3. 员工在讨论中途拉人的真实路径（表已支持 `invited_by`/`invited_reason`，代码未写）。
