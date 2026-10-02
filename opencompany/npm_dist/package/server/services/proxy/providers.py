"""Template-driven proxy provider.

Single class that formats proxy URLs from a JSON url_template config.
Supports any residential proxy provider without code changes.
The LLM generates url_template configs via python_code tool.
"""

import uuid
from typing import Any, Dict, Optional

from services.proxy.models import GeoTarget, SessionType


class TemplateProxyProvider:
    """Universal proxy provider that formats URLs from a JSON template.

    Supports 3 encoding strategies via the ``param_field`` template key:
    - ``"username"`` - params appended to username (most providers)
    - ``"password"`` - params appended to password (IPRoyal, Rayobyte)
    - ``"none"``     - no encoding, plain credentials (generic/custom)

    Template schema (stored as JSON in DB ``url_template`` column)::

        {
            "param_field": "username",
            "username_prefix": "{username}",
            "username_param_separator": "-",
            "param_separator": "-",
            "param_keys": {
                "country": "country-{v}",
                "state": "state-{v}",
                "city": "city-{v}",
                "session_id": "session-{v}",
                "session_duration": "sessionduration-{v}"
            },
            "country_case": "lower",
            "city_separator": "_"
        }
    """

    def __init__(self, name: str, template: Dict[str, Any]):
        self.name = name
        self._tpl = template

    def format_proxy_url(
        self,
        username: str,
        password: str,
        host: str,
        port: int,
        geo: Optional[GeoTarget] = None,
        session_type: SessionType = SessionType.ROTATING,
        session_id: Optional[str] = None,
        sticky_duration_minutes: Optional[int] = None,
    ) -> str:
        """Format a complete proxy URL using the template config.

        Args:
            username: Base username from credentials
            password: Password from credentials
            host: Gateway host
            port: Gateway port
            geo: Geographic targeting (country, city, state)
            session_type: Rotating or sticky session
            session_id: Sticky session identifier (auto-generated if None)
            sticky_duration_minutes: Sticky session duration in minutes

        Returns:
            Complete proxy URL: http://encoded-user:pass@host:port
        """
        tpl = self._tpl
        param_field = tpl.get("param_field", "username")
        keys = tpl.get("param_keys", {})
        country_case = tpl.get("country_case", "lower")
        city_sep = tpl.get("city_separator", "_")

        # Build param fragments
        params: list[str] = []

        if geo and geo.country and "country" in keys:
            cc = _apply_case(geo.country, country_case)
            params.append(keys["country"].replace("{v}", cc))

        if geo and geo.state and "state" in keys:
            state = geo.state.lower().replace(" ", city_sep)
            params.append(keys["state"].replace("{v}", state))

        if geo and geo.city and "city" in keys:
            city = geo.city.lower().replace(" ", city_sep)
            params.append(keys["city"].replace("{v}", city))

        if session_type == SessionType.STICKY and "session_id" in keys:
            sid = session_id or uuid.uuid4().hex[:12]
            params.append(keys["session_id"].replace("{v}", sid))

        if sticky_duration_minutes and "session_duration" in keys:
            params.append(keys["session_duration"].replace("{v}", str(sticky_duration_minutes)))

        param_str = tpl.get("param_separator", "-").join(params) if params else ""

        # Format username from prefix template
        prefix = tpl.get("username_prefix", "{username}").replace("{username}", username)

        if param_field == "username" and param_str:
            sep = tpl.get("username_param_separator", "-")
            final_user = f"{prefix}{sep}{param_str}"
            final_pass = password
        elif param_field == "password" and param_str:
            final_user = prefix
            final_pass = f"{password}{param_str}"
        else:
            final_user = prefix
            final_pass = password

        if not host or not port:
            raise ValueError(f"Provider '{self.name}' requires host and port")

        if final_user and final_pass:
            return f"http://{final_user}:{final_pass}@{host}:{port}"
        return f"http://{host}:{port}"


def _apply_case(value: str, case: str) -> str:
    """Apply case transformation to a string value."""
    if case == "lower":
        return value.lower()
    if case == "upper":
        return value.upper()
    return value
