"""Webhook verifier base — single-method contract."""

from __future__ import annotations

from typing import Mapping


class WebhookVerifier:
    """Abstract base. Each provider's signature scheme is one subclass."""

    @classmethod
    def verify(cls, headers: Mapping[str, str], body: bytes, secret: str) -> None:
        """Raise ``ValueError`` if the request is not authentic.

        ``headers`` is case-insensitive at the caller's discretion;
        verifiers handle the lookup themselves to stay defensive.
        ``body`` is the raw request bytes (signed payload).
        ``secret`` is the provider-issued signing secret.
        """
        raise NotImplementedError

    @staticmethod
    def _header(headers: Mapping[str, str], name: str) -> str:
        target = name.lower()
        for k, v in headers.items():
            if k.lower() == target:
                return v
        return ""
