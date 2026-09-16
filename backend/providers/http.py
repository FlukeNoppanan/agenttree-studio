"""Shared safe HTTP behavior for discovery adapters."""

from collections.abc import Mapping
from typing import Any

import httpx

from backend.providers.base import ProviderDiscoveryError


class HttpDiscoveryAdapter:
    provider_label = "Provider"

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
                with httpx.Client(timeout=15.0, follow_redirects=False) as client:
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
            ) from exc
