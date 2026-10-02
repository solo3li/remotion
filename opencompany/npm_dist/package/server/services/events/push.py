"""PushEventSource — events arrive via external write (HTTP webhook,
RPC callback, server-sent event). The source itself is passive: it
exposes a :meth:`receive` method that whoever owns the inbound channel
calls with each new payload, and an internal queue surfaces the events
through the standard :meth:`emit` async iterator.

Used directly by :class:`WebhookSource` (in webhook.py); future RPC /
SSE sources subclass this same base.
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

from .envelope import WorkflowEvent
from .source import EventSource


class PushEventSource(EventSource):
    """Push-mode source: external code calls :meth:`receive` with each
    event; :meth:`emit` yields them in order.
    """

    def __init__(self) -> None:
        super().__init__()
        self._queue: asyncio.Queue[WorkflowEvent] = asyncio.Queue()

    async def receive(self, event: WorkflowEvent) -> None:
        """Hand-off from the inbound channel into the framework queue."""
        await self._queue.put(event)

    async def emit(self) -> AsyncIterator[WorkflowEvent]:
        while not self._stopped:
            event = await self._queue.get()
            yield event
