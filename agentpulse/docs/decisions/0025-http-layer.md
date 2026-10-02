# ADR 0025 — HTTP 层：桥端点、三端接口、实时推送

- 日期：2026-08-22
- 状态：已实现
- 依赖：[ADR 0021](0021-employee-workstation-and-resource-leases.md)（零服务器 / 三端）、[ADR 0022](0022-human-bridge.md)（人机桥）、[ADR 0024](0024-sqlite-company-facts.md)（落库）

## 决策一：两类端点，边界写在代码里

| 前缀 | 谁调 | 特点 |
|---|---|---|
| `/internal/bridge/*` | 只有本机的 dsh 员工进程（人机桥） | **会长时间阻塞** —— 员工在等老板回答 |
| 其余 | 三端客户端 | 立刻返回 |

`/internal/bridge/*` 的阻塞不是设计缺陷。员工确实在等人，超时上限 30 分钟（与插件侧一致）。超时后落 `status='expired'` 并返回 **504** —— 桥收到非 2xx 会 fail-closed，正是要的。

## 决策二：`/rooms/{id}/say` 立刻返回，讨论在后台跑

老板说一句话，一屋子员工聊完要几分钟，任何客户端都会先超时。所以 `/say` 落库 + 推送后立刻返回，讨论用 `asyncio.create_task` 在后台推进，进展经 `/events` 推给三端。

**后台任务里的异常必须吞住并推一条 `error` 事件。** fire-and-forget 任务抛出去只会变成一条没人看的 `Task exception was never retrieved`，而老板会以为员工还在思考 —— 有测试专门盯这条。

## 决策三：进程内两条总线，不上 Redis

P1 单进程（ADR 0021）。`AskBus` 把"桥在等答案"和"老板在另一个请求里回答了"接上；`EventBus` 是广播流，三端订阅它。上服务器时换实现，接口不变。

`EventBus.publish` 对跟不上的订阅者**丢事件而不是阻塞发布方** —— 客户端重连时会重新拉全量，而为了一个卡住的手机拖住整个公司是更糟的选择。

`answer_ask` 落库先于唤醒桥：先持久化，才不会出现"员工拿到答案但库里没记"。回答时 `delivered_to_employee=False` 不是错误 —— 可能 API 重启过、桥那边连接早断了。

## 三个真 bug，都是测试抓出来的（记下来，别再踩）

1. **`asyncio.to_thread` 是必需的，不是优化。** dsh 的 Python SDK 是同步阻塞的，从 async 里直接调会冻住整个事件循环 —— 员工思考的那一分钟里 SSE 推送和所有其他请求全部停摆。`employee_turn.py` 现在把它丢进线程。
2. **FastAPI 的请求模型必须定义在模块级。** `api.py` 开头有 `from __future__ import annotations`，所有注解都是字符串，而 FastAPI 用**模块全局**命名空间解析它们。定义在 `create_app` 内部的 Pydantic 模型解析不到，FastAPI 会把 body 当 query 参数，返回 422。
3. **SSE 里不要用 `request.is_disconnected()`。** 它会 await ASGI 的 `receive()`，客户端不主动发 `http.disconnect` 时永久阻塞，一个字节都出不来。客户端断开时 Starlette 会取消生成器，`async with` 的 finally 自己退订 —— 那才是可靠的退出路径。

## 一条测试基建结论

**SSE 必须用真 uvicorn 测。** httpx 的 `ASGITransport` 不支持流式响应（缓冲整个 body），而 Starlette 的 `StreamingResponse` 会一直等 `receive()` 的 disconnect —— 两者一碰，`c.stream()` 在进入时就挂死。这不是本项目的 bug，但意味着 ASGITransport 测不了 SSE，而 **SSE 正是三端同源的机制**，必须真测。测试里有个 `live` fixture 起真 uvicorn（临时端口、线程里跑）。

## 验证

`tests/test_api.py` —— **10 passed，3.25s**。核心那条 `test_bridge_blocks_until_the_boss_answers_from_another_client`：员工问上来后桥挂起 → 断言它**没有**提前返回 → 老板在**另一个** HTTP 请求里回答（模拟手机）→ 答案回到员工手上。这就是 P1 整个交互的核心链路。

另有：重复回答返 409（手机和 Mac 同时点）、超时返 504 且落 `expired`、没人等待时回答仍落库、后台讨论失败会推 error、SSE 真的把 Mac 上说的话送到订阅者。

全套 **49 passed**。

## 未做（P1 收尾或 P3 前必须做）

- **认证与多租户隔离。** P1 是单进程单老板局域网，`/internal/bridge/*` 只有本机 dsh 进程会调。一旦不是这个部署形态，这两条假设同时失效。代码里有 `TODO(P3)` 标着。
- 长 transcript 分页（目前 `/rooms/{id}` 全量返回）。
- API 重启后重新唤醒 `pending` 的 asks —— 现在桥那边的连接已断，只能等下一轮。
