"""Shared safe HTTP behavior for discovery adapters."""

from collections.abc import Mapping
from ipaddress import ip_address
from typing import Any
from urllib.parse import urlsplit

import httpx

from backend.providers.base import ProviderDiscoveryError


def url_targets_loopback(url: str) -> bool:
    """Return whether a URL explicitly targets localhost or a loopback IP."""
    host = urlsplit(url).hostname
    if not host:
        return False
    if host.rstrip(".").casefold() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


class HttpDiscoveryAdapter:
    provider_label = "Provider"
    trust_env = True

    def __init__(self, client: httpx.Client | None = None) -> None:
        self._client = client

    def _get(
        self,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        params: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        try:
            if self._client is not None:
                response = self._client.get(url, headers=headers, params=params)
            else:
                with httpx.Client(
                    timeout=15.0,
                    follow_redirects=False,
                    trust_env=self.trust_env,
                ) as client:
                    response = client.get(url, headers=headers, params=params)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("response must be an object")
            return payload
        except Exception as exc:
            # Never propagate SDK/HTTP messages: Gemini URLs can contain API keys,
            # and some provider response bodies echo credential diagnostics.
            raise ProviderDiscoveryError(
                f"{self.provider_label} connection or model discovery failed",
                diagnostic=self._safe_diagnostic(exc),
            ) from exc

    @staticmethod
    def _safe_diagnostic(error: Exception) -> str:
        if isinstance(error, httpx.ProxyError):
            return "proxy connection failed"
        if isinstance(error, httpx.TimeoutException):
            return "request timed out"
        if isinstance(error, httpx.ConnectError):
            return "could not connect to server"
        if isinstance(error, httpx.HTTPStatusError):
            return f"server returned HTTP {error.response.status_code}"
        if isinstance(error, (ValueError, httpx.DecodingError)):
            return "server returned an invalid response"
        return "request failed"
