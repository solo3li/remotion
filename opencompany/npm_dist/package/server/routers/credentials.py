"""Credentials routes.

Phase A of the credentials-scaling plan: lazy per-tile icon endpoint.

Serves SVG icons for credential providers out of
``server/static/credential_icons/<provider_id>.svg`` with long-lived
``Cache-Control: immutable`` headers. If no file is present, returns 404
so the client falls back to its existing in-bundle icon resolution (see
``client/src/components/credentials/providers.tsx`` and
``client/src/components/icons/AIProviderIcons.tsx``).

This follows n8n's lazy-icon pattern: the frontend does not need to bundle
icons as data URIs, and the backend can later serve per-customer or
user-uploaded provider icons without a frontend redeploy.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/credentials", tags=["credentials"])

# Resolve the icons directory relative to the server package root so it
# works under both local dev and Docker (where /app is the cwd).
_STATIC_ICONS_DIR = Path(__file__).parent.parent / "static" / "credential_icons"

# Only allow a conservative subset of characters in the provider_id to
# prevent path traversal. The credential registry uses lowercase
# alphanumerics and underscores throughout.
_ALLOWED_CHARS = set("abcdefghijklmnopqrstuvwxyz0123456789_-")

# 1 year, immutable: SVG content never changes for a given provider_id.
# If we ever need to invalidate, bump the version in
# credential_providers.json and the frontend will cache-bust via the
# catalogue version hash it already holds.
_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


def _safe_icon_path(provider_id: str) -> Path | None:
    """Return an absolute path to the icon file if it's safe and exists.

    Returns None if the provider_id is malformed, points outside the
    icons directory, or the file is missing.
    """
    if not provider_id or len(provider_id) > 64:
        return None
    if not all(ch in _ALLOWED_CHARS for ch in provider_id):
        return None

    candidate = (_STATIC_ICONS_DIR / f"{provider_id}.svg").resolve()
    try:
        # Ensure the resolved path is still inside the icons dir.
        candidate.relative_to(_STATIC_ICONS_DIR.resolve())
    except ValueError:
        logger.warning("credentials.icon: path traversal rejected for %r", provider_id)
        return None

    if not candidate.is_file():
        return None
    return candidate


@router.get("/icon/{provider_id}")
async def get_credential_icon(provider_id: str) -> Response:
    """Serve a credential provider icon SVG with long-lived caching.

    The frontend fetches this lazily per-tile as the credentials palette
    scrolls (n8n pattern). Missing icons return 404 and the client falls
    back to its in-bundle icon resolution, so this endpoint is optional
    for the current 20-provider catalogue but is wired now so the shape
    is stable for the 5000-provider target.
    """
    path = _safe_icon_path(provider_id)
    if path is None:
        raise HTTPException(status_code=404, detail="icon not found")

    return FileResponse(
        path,
        media_type="image/svg+xml",
        headers={"Cache-Control": _IMMUTABLE_CACHE},
    )
