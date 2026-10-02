"""Fixtures for the credentials test suite.

Isolated from tests/conftest.py (which stubs core.logging for LLM provider tests).
The credentials suite needs the REAL core.logging because it imports the actual
encryption / credentials_database / auth modules.
"""

import sys
from pathlib import Path
from typing import AsyncIterator

import pytest
import pytest_asyncio

# Make sure server/ is importable even when pytest is invoked from repo root.
SERVER_DIR = Path(__file__).resolve().parents[2]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

# The parent conftest at server/tests/conftest.py unconditionally stubs `core`
# and `core.logging` for the LLM provider tests.  We need the REAL modules.
# Wipe ANY core.* entries so subsequent imports load from disk.
for mod_name in [name for name in list(sys.modules) if name == "core" or name.startswith("core.")]:
    del sys.modules[mod_name]

from core.encryption import EncryptionService  # noqa: E402
from core.credentials_database import CredentialsDatabase  # noqa: E402


# --- Encryption fixtures -----------------------------------------------------


@pytest.fixture
def encryption_password() -> str:
    """Deterministic encryption password used by tests."""
    return "test-password-not-for-production-use"


@pytest.fixture
def encryption_salt() -> bytes:
    """Deterministic 32-byte salt."""
    return b"\x00" * 32


@pytest.fixture
def encryption(encryption_password: str, encryption_salt: bytes) -> EncryptionService:
    """Initialized EncryptionService ready to encrypt/decrypt."""
    svc = EncryptionService()
    svc.initialize(encryption_password, encryption_salt)
    return svc


@pytest.fixture
def uninitialized_encryption() -> EncryptionService:
    """EncryptionService with no key loaded."""
    return EncryptionService()


# --- CredentialsDatabase fixture ---------------------------------------------


@pytest_asyncio.fixture
async def credentials_db(
    tmp_path,
    encryption_password: str,
) -> AsyncIterator[CredentialsDatabase]:
    """Fresh on-disk SQLite DB per test (in tmp_path), real Fernet encryption."""
    db_path = tmp_path / "credentials.db"
    encryption = EncryptionService()

    db = CredentialsDatabase(str(db_path), encryption)
    salt = await db.initialize()
    encryption.initialize(encryption_password, salt)

    try:
        yield db
    finally:
        await db.engine.dispose()


# --- AuthService fixture -----------------------------------------------------


class _StubCache:
    """Minimal CacheService stub -- AuthService keeps the reference but doesn't use it."""


class _StubDatabase:
    """Minimal Database stub for AuthService (kept only for backward compat)."""


class _StubSettings:
    """Minimal Settings stub."""


@pytest_asyncio.fixture
async def auth_service(credentials_db: CredentialsDatabase):
    """AuthService backed by the real credentials_db fixture."""
    from services.auth import AuthService

    return AuthService(
        credentials_db=credentials_db,
        cache=_StubCache(),
        database=_StubDatabase(),
        settings=_StubSettings(),
    )
