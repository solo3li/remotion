"""Idempotency key service.

Phase 7.5b of the credentials-scaling plan. Generalizes to any mutation
handler in the platform refactor (control plane RFC, Phase C).

Client mutations include an opaque `request_id` (UUID generated in the
browser via `crypto.randomUUID()`). The server caches the result per
request_id with a short TTL. If the same request_id arrives twice (retry,
WebSocket reconnect, user double-click, etc.), the server returns the
cached result instead of re-running the mutation. Prevents double-writes
and makes every mutation handler safe to retry.

Design decisions
----------------
- Process-local dict, not Redis — at our scale (single-user / small-team
  self-hosted) process-local is enough. Survives handler-internal retries
  but not server restarts; that's the correct tradeoff for a 60 s window.
- Positive and negative caching: both successful results and raised
  exceptions are cached, so a retried mutation that would have failed
  the first time still fails on retry (rather than silently succeeding).
- TTL is in wall-clock seconds; entries are pruned lazily on access,
  avoiding a background sweeper task.
- Thread/async safe via a per-scope asyncio.Lock; lock is only held for
  the cache-miss window, not for the duration of the wrapped function.

Usage
-----
    from services.idempotency import get_idempotency_store

    store = get_idempotency_store("credentials")

    async def handle_save_credential(data, websocket):
        request_id = data.get("request_id")
        return await store.run(
            request_id,
            lambda: _do_save(data),
        )

Routers that omit `request_id` fall through to a direct call with no
caching — callers are not forced to opt in.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class _CacheEntry:
    result: Any
    exception: Optional[BaseException]
    expires_at: float


class IdempotencyStore:
    """Per-scope TTL-bounded idempotency cache.

    Each router or module typically owns one store, keyed by the
    handler's logical scope (e.g. ``"credentials"``, ``"workflow"``),
    so request_id collisions across scopes are impossible.
    """

    def __init__(self, scope: str, ttl_seconds: float = 60.0) -> None:
        self._scope = scope
        self._ttl = ttl_seconds
        self._entries: Dict[str, _CacheEntry] = {}
        # Per-request_id locks prevent two concurrent calls with the same
        # request_id from both running the underlying function. First
        # caller executes; second caller awaits the same lock and then
        # hits the cache.
        self._locks: Dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    # ----- public API -----

    async def run(
        self,
        request_id: Optional[str],
        func: Callable[[], Awaitable[Any]],
    ) -> Any:
        """Run ``func`` and cache the result by ``request_id``.

        If ``request_id`` is falsy, ``func`` runs directly with no
        caching. This keeps the opt-in contract one-sided: clients that
        supply a request_id get dedupe; clients that don't get normal
        behavior.
        """
        if not request_id:
            return await func()

        # Fast path: hit the cache without acquiring a per-key lock.
        cached = self._lookup(request_id)
        if cached is not None:
            return self._materialize(cached)

        # Slow path: ensure only one coroutine per request_id runs at a
        # time. Concurrent duplicate requests queue on the same lock.
        lock = await self._get_lock(request_id)
        async with lock:
            cached = self._lookup(request_id)
            if cached is not None:
                return self._materialize(cached)

            try:
                result = await func()
            except BaseException as exc:  # noqa: BLE001 — we re-raise below
                self._store_failure(request_id, exc)
                raise
            else:
                self._store_success(request_id, result)
                return result

    def stats(self) -> Dict[str, Any]:
        """Return observability stats for logging/debug endpoints."""
        now = time.monotonic()
        live = sum(1 for e in self._entries.values() if e.expires_at > now)
        return {
            "scope": self._scope,
            "ttl_seconds": self._ttl,
            "entries_total": len(self._entries),
            "entries_live": live,
        }

    def clear(self) -> None:
        """Drop all entries. Tests or manual admin use only."""
        self._entries.clear()
        self._locks.clear()

    # ----- internals -----

    def _lookup(self, request_id: str) -> Optional[_CacheEntry]:
        entry = self._entries.get(request_id)
        if entry is None:
            return None
        if entry.expires_at <= time.monotonic():
            # Lazy eviction — drop the stale entry on access.
            self._entries.pop(request_id, None)
            return None
        return entry

    def _materialize(self, entry: _CacheEntry) -> Any:
        if entry.exception is not None:
            raise entry.exception
        return entry.result

    def _store_success(self, request_id: str, result: Any) -> None:
        self._entries[request_id] = _CacheEntry(
            result=result,
            exception=None,
            expires_at=time.monotonic() + self._ttl,
        )
        logger.debug("idempotency[%s]: cached success for %s", self._scope, request_id)

    def _store_failure(self, request_id: str, exc: BaseException) -> None:
        self._entries[request_id] = _CacheEntry(
            result=None,
            exception=exc,
            expires_at=time.monotonic() + self._ttl,
        )
        logger.debug(
            "idempotency[%s]: cached failure for %s: %s",
            self._scope,
            request_id,
            type(exc).__name__,
        )

    async def _get_lock(self, request_id: str) -> asyncio.Lock:
        async with self._global_lock:
            lock = self._locks.get(request_id)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[request_id] = lock
            return lock


# ----- module-level registry -----

_STORES: Dict[str, IdempotencyStore] = {}


def get_idempotency_store(scope: str, ttl_seconds: float = 60.0) -> IdempotencyStore:
    """Return (creating on first call) the shared store for ``scope``.

    Scopes are free-form namespaces. Pick one per router or per logical
    domain — e.g. ``"credentials"``, ``"workflow"``, ``"nodespec"``.
    """
    store = _STORES.get(scope)
    if store is None:
        store = IdempotencyStore(scope, ttl_seconds=ttl_seconds)
        _STORES[scope] = store
    return store
