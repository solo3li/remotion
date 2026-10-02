"""GitHub webhook signature verifier.

Header: ``X-Hub-Signature-256: sha256=<hex_hmac>``
Algorithm: HMAC-SHA256 of the secret over the raw body, hex-encoded.
Reference: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Mapping

from .base import WebhookVerifier


class GitHubVerifier(WebhookVerifier):
    @classmethod
    def verify(cls, headers: Mapping[str, str], body: bytes, secret: str) -> None:
        sig = cls._header(headers, "x-hub-signature-256")
        if not sig.startswith("sha256="):
            raise ValueError("X-Hub-Signature-256 missing or malformed")
        expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise ValueError("X-Hub-Signature-256 mismatch")
