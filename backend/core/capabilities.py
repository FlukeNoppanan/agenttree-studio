"""Canonical capability identifiers shared across Studio boundaries."""

import re


_SEPARATORS = re.compile(r"[\s_]+")
_UNSAFE = re.compile(r"[^a-z0-9-]+")
_REPEATED_HYPHENS = re.compile(r"-+")


def normalize_capability(value: str) -> str:
    """Normalize a human phrase into a reusable lowercase capability ID."""
    if not isinstance(value, str):
        raise ValueError("Capability must be a string")
    normalized = _SEPARATORS.sub("-", value.strip().lower())
    normalized = _UNSAFE.sub("-", normalized)
    normalized = _REPEATED_HYPHENS.sub("-", normalized).strip("-")
    if not normalized:
        raise ValueError("Capability cannot be empty")
    if len(normalized) > 100:
        raise ValueError("Capability cannot exceed 100 characters")
    return normalized


def capability_label(capability_id: str) -> str:
    """Create a readable label without changing canonical identity."""
    return " ".join(part.capitalize() for part in capability_id.split("-") if part)


def normalize_capabilities(values: list[str]) -> list[str]:
    """Normalize and de-duplicate values while retaining their first order."""
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        try:
            normalized = normalize_capability(value)
        except ValueError:
            continue
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result
