"""Proxy service exception hierarchy."""


class ProxyError(Exception):
    """Base exception for all proxy-related errors."""


class ProviderError(ProxyError):
    """Error from a specific proxy provider."""

    def __init__(self, provider_name: str, message: str):
        self.provider_name = provider_name
        super().__init__(f"[{provider_name}] {message}")


class NoHealthyProviderError(ProxyError):
    """No healthy proxy providers available."""


class BudgetExceededError(ProxyError):
    """Daily proxy budget has been exceeded."""

    def __init__(self, budget_usd: float, spent_usd: float):
        self.budget_usd = budget_usd
        self.spent_usd = spent_usd
        super().__init__(f"Daily budget ${budget_usd:.2f} exceeded (spent ${spent_usd:.2f})")


class ProxyConfigError(ProxyError):
    """Invalid proxy configuration."""
