"""Stripe webhook signature verifier.

Header format: ``Stripe-Signature: t=<unix_ts>,v1=<hex_hmac>[,v1=<rotated>]``
Signed payload: ``f"{timestamp}.{raw_body}"``  (HMAC-SHA256, hex)
Reference: https://stripe.com/docs/webhooks/signatures
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Mapping

from .base import WebhookVerifier


class StripeVerifier(WebhookVerifier):
    @classmethod
    def verify(cls, headers: Mapping[str, str], body: bytes, secret: str) -> None:
        sig_header = cls._header(headers, "stripe-signature")
        if not sig_header:
            raise ValueError("Stripe-Signature header missing")

        timestamp = ""
        candidates: list[str] = []
        for part in sig_header.split(","):
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            k = k.strip()
            v = v.strip()
            if k == "t":
                timestamp = v
            elif k == "v1":
                candidates.append(v)
        if not timestamp or not candidates:
            raise ValueError("Stripe-Signature missing t= or v1= component")

        signed = f"{timestamp}.".encode() + body
        expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, c) for c in candidates):
            raise ValueError("Stripe-Signature mismatch")
