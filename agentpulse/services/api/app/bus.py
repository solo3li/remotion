"""进程内的两条总线：等老板回答，和推给三端。

P1 是单进程（ADR 0021 零服务器），所以两条都是进程内的，不需要 Redis。
上服务器时换实现，接口不变。

**等待是必需的，不是优化**：人机桥打上来一个问题后会一直阻塞，直到老板在
任意一端回答（ADR 0022）。员工确实在等人。
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator


class AskBus:
    """把「桥在等答案」和「老板在别的请求里回答了」接上。"""

    def __init__(self) -> None:
        self._waiters: dict[str, asyncio.Future[dict]] = {}

    async def wait(self, ask_id: str, *, timeout: float) -> dict:
        """等这个 ask 被回答。超时抛 TimeoutError（桥会 fail-closed）。"""
        loop = asyncio.get_running_loop()
        fut = self._waiters.setdefault(ask_id, loop.create_future())
        try:
            return await asyncio.wait_for(asyncio.shield(fut), timeout)
        finally:
            if fut.done():
                self._waiters.pop(ask_id, None)

    def resolve(self, ask_id: str, answer: dict) -> bool:
        """老板回答了。返回是否真有人在等（没人等也不算错 —— 可能是重启后补答）。"""
        fut = self._waiters.pop(ask_id, None)
        if fut is None or fut.done():
            return False
        fut.set_result(answer)
        return True

    def cancel_all(self, reason: str = "shutting down") -> None:
        for ask_id, fut in list(self._waiters.items()):
            if not fut.done():
                fut.set_exception(RuntimeError(reason))
            self._waiters.pop(ask_id, None)


class EventBus:
    """一条广播流。三端订阅它，所以 Mac 上说的话手机上立刻出现。"""

    def __init__(self, *, backlog: int = 64) -> None:
        self._subs: set[asyncio.Queue[dict]] = set()
        self._backlog = backlog

    def publish(self, event: dict) -> None:
        """推给所有订阅者。慢的订阅者会丢事件而不是拖住发布方。"""
        for q in list(self._subs):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                # 客户端跟不上就让它丢 —— 它重连时会重新拉全量。
                # 阻塞发布方等一个卡住的手机是更糟的选择。
                pass

    @contextlib.asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[dict]]:
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=self._backlog)
        self._subs.add(q)
        try:
            yield q
        finally:
            self._subs.discard(q)

    @property
    def subscriber_count(self) -> int:
        return len(self._subs)
