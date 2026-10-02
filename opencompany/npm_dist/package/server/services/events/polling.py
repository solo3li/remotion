"""PollingEventSource — periodic pull from an external API.

Replaces the duplicated loop frame in gmail_receive.py / email_receive.py /
twitter_receive.py. Subclasses implement :meth:`poll_once` and the
framework owns sleep timing, baseline-state persistence, and cancellation.
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator, ClassVar, Dict, Iterable

from core.logging import get_logger

from .envelope import WorkflowEvent
from .source import EventSource

logger = get_logger(__name__)


class PollingEventSource(EventSource):
    """Polling-mode source. Subclasses provide :meth:`poll_once`."""

    poll_interval_default: ClassVar[int] = 60

    def __init__(self, poll_interval: int | None = None) -> None:
        super().__init__()
        self.poll_interval = poll_interval or self.poll_interval_default
        self._state: Dict = {}

    async def load_state(self) -> Dict:
        """Override to hydrate cursor / last-seen-id from disk or DB.
        Default keeps state in-memory only (lost on restart)."""
        return self._state

    async def save_state(self, state: Dict) -> None:
        """Override to persist cursor across restarts."""
        self._state = state

    async def poll_once(self, state: Dict) -> Iterable[WorkflowEvent]:
        """Return any new events since the last poll. Mutate ``state``
        in place to record what was seen."""
        raise NotImplementedError

    async def emit(self) -> AsyncIterator[WorkflowEvent]:
        state = await self.load_state()
        while not self._stopped:
            try:
                events = await self.poll_once(state) or []
                await self.save_state(state)
                for ev in events:
                    yield ev
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("[%s] poll_once failed: %s", self.type, e)
            try:
                await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break
