"""Webhook signature verifiers — pluggable HMAC schemes per provider.

Each verifier is a stateless class with one method:

    verify(headers, body, secret) -> None    # raises ValueError on mismatch

Plugins reference verifier classes directly; there's no string-keyed
registry to avoid (yet another) lookup table.
"""

from __future__ import annotations

from .base import WebhookVerifier
from .hmac_basic import HmacVerifier
from .stripe import StripeVerifier
from .standard_webhooks import StandardWebhooksVerifier
from .github import GitHubVerifier

__all__ = [
    "WebhookVerifier",
    "HmacVerifier",
    "StripeVerifier",
    "StandardWebhooksVerifier",
    "GitHubVerifier",
]
