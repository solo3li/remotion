"""SQLite-backed cache model for key-value storage with TTL.

Follows n8n pattern where SQLite is sufficient for single-process deployments,
with Redis used only for distributed queue mode.
"""

import time
from typing import Optional
from sqlmodel import SQLModel, Field


class CacheEntry(SQLModel, table=True):
    """Generic key-value cache with optional expiration.

    Used as Redis alternative for local development (no Docker required).
    Production can use Redis for better performance at scale.
    """

    __tablename__ = "cache_entries"

    key: str = Field(primary_key=True, max_length=512)
    value: str = Field(max_length=1000000)  # JSON serialized, up to 1MB
    expires_at: Optional[float] = Field(default=None, index=True)  # Unix timestamp
    created_at: float = Field(default_factory=time.time)
