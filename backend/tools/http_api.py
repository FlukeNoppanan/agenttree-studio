"""Credential-safe synchronous HTTP API adapter for AgentTree ToolExecutor."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Mapping
from urllib.parse import quote, urlsplit

import httpx
from agenttree.tools import BaseTool, ToolResult
from agenttree.tools.mcp import normalize_mcp_input_schema

from backend.core.sanitization import sanitize_value


_PLACEHOLDER = re.compile(r"(?<!\{)\{([A-Za-z_][A-Za-z0-9_]*)\}(?!\})")
_HEADER = re.compile(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+")
_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}


class HTTPAPITool(BaseTool):
    def __init__(
        self,
        *,
        tool_id: str,
        name: str,
        description: str,
        configuration: Mapping[str, Any],
        credential: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        config = deepcopy(dict(configuration))
        method = str(config.get("method", "GET")).upper()
        if method not in _METHODS:
            raise ValueError("HTTP Tool method is unsupported")
        url = config.get("url")
        self._validate_url(url)
        timeout = config.get("timeout", 30)
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= 120:
            raise ValueError("HTTP Tool timeout must be between 0 and 120 seconds")
        headers = config.get("headers", {})
        query = config.get("query", {})
        input_schema = config.get("input_schema", {"type": "object", "properties": {}})
        if not isinstance(headers, Mapping) or any(
            not isinstance(key, str) or not _HEADER.fullmatch(key)
            or not isinstance(value, str) or any(char in value for char in "\r\n\0")
            for key, value in headers.items()
        ):
            raise ValueError("HTTP Tool headers are invalid")
        if not isinstance(query, Mapping) or any(
            not isinstance(key, str) or not isinstance(value, str) for key, value in query.items()
        ):
            raise ValueError("HTTP Tool query configuration is invalid")
        if not isinstance(input_schema, Mapping):
            raise ValueError("HTTP Tool input_schema must be an object")
        output_handling = config.get("output_handling", "json")
        if output_handling not in {"json", "text"}:
            raise ValueError("HTTP Tool output_handling must be json or text")
        self._method = method
        self._url = url
        self._headers = dict(headers)
        self._query = dict(query)
        self._timeout = float(timeout)
        self._output_handling = output_handling
        self._credential = credential
        self._transport = transport
        super().__init__(
            tool_id=tool_id,
            name=name,
            description=description,
            input_spec=normalize_mcp_input_schema(input_schema),
            metadata={"source": "http_api", "method": method},
        )

    @staticmethod
    def _validate_url(url: Any) -> None:
        if not isinstance(url, str) or not url or any(
            character.isspace() or ord(character) < 32 for character in url
        ):
            raise ValueError("HTTP Tool URL is invalid")
        try:
            parsed = urlsplit(url)
            valid = (
                parsed.scheme in {"http", "https"}
                and parsed.hostname
                and not parsed.username
                and not parsed.password
                and not parsed.fragment
            )
            parsed.port
        except ValueError as error:
            raise ValueError("HTTP Tool URL is invalid") from error
        if not valid:
            raise ValueError("HTTP Tool URL must be HTTP(S) without credentials or fragment")

    def _replace(
        self,
        template: str,
        arguments: Mapping[str, Any],
        used: set[str],
        *,
        encode: bool,
    ) -> str:
        def substitution(match: re.Match[str]) -> str:
            key = match.group(1)
            if key not in arguments:
                raise ValueError(f"Missing required URL/query argument: {key}")
            used.add(key)
            value = str(arguments[key])
            return quote(value, safe="") if encode else value
        rendered = _PLACEHOLDER.sub(substitution, template)
        if "{{secret}}" in rendered:
            if self._credential is None:
                raise ValueError("HTTP Tool requires a configured Secret")
            credential = quote(self._credential, safe="") if encode else self._credential
            rendered = rendered.replace("{{secret}}", credential)
        return rendered

    def _prepared_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        for key, value in self._headers.items():
            if "{{secret}}" in value:
                if self._credential is None:
                    raise ValueError("HTTP Tool requires a configured Secret")
                value = value.replace("{{secret}}", self._credential)
            headers[key] = value
        return headers

    def invoke(self, arguments: Mapping[str, Any]) -> ToolResult:
        if not isinstance(arguments, Mapping):
            raise TypeError("arguments must be a mapping")
        prepared = deepcopy(dict(arguments))
        used: set[str] = set()
        try:
            url = self._replace(self._url, prepared, used, encode=True)
            query = {
                key: self._replace(value, prepared, used, encode=False)
                for key, value in self._query.items()
            }
            remaining = {key: value for key, value in prepared.items() if key not in used}
            request: dict[str, Any] = {
                "method": self._method,
                "url": url,
                "headers": self._prepared_headers(),
                "timeout": self._timeout,
            }
            if self._method in {"GET", "DELETE", "HEAD"}:
                request["params"] = {**remaining, **query}
            else:
                request["params"] = query
                request["json"] = remaining
            with httpx.Client(
                transport=self._transport,
                follow_redirects=False,
                trust_env=False,
            ) as client:
                response = client.request(**request)
            if response.status_code < 200 or response.status_code >= 300:
                return ToolResult(
                    tool_id=self.id,
                    success=False,
                    error=f"HTTP Tool returned status {response.status_code}",
                    metadata={"status_code": response.status_code},
                )
            if self._output_handling == "text":
                output: Any = response.text
            else:
                try:
                    output = response.json()
                except ValueError:
                    return ToolResult(
                        tool_id=self.id,
                        success=False,
                        error="HTTP Tool returned invalid JSON",
                        metadata={"status_code": response.status_code},
                    )
            secrets = (self._credential,) if self._credential else ()
            return ToolResult(
                tool_id=self.id,
                success=True,
                output=sanitize_value(output, secrets),
                metadata={
                    "status_code": response.status_code,
                    "content_type": response.headers.get("content-type"),
                },
            )
        except (httpx.TimeoutException, httpx.RequestError):
            return ToolResult(tool_id=self.id, success=False, error="HTTP Tool request failed")
        except (TypeError, ValueError):
            raise
        except Exception:
            return ToolResult(tool_id=self.id, success=False, error="HTTP Tool execution failed")
