"""Production configuration contracts that do not require Railway services."""

import pytest

from backend.core.config import Settings


def test_railway_postgres_url_uses_psycopg(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENTTREE_STUDIO_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgres.railway.internal:5432/studio")
    assert Settings().database_url == "postgresql+psycopg://user:pass@postgres.railway.internal:5432/studio"
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@postgres.railway.internal:5432/studio")
    assert Settings().database_url.startswith("postgresql+psycopg://")


def test_public_origin_requires_exact_https_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTTREE_STUDIO_PUBLIC_ORIGIN", "https://studio.example.test/")
    assert Settings().public_origin == "https://studio.example.test"
    for invalid in ("http://studio.example.test", "https://studio.example.test/path",
                    "https://studio.example.test?x=1", "https://user:pass@studio.example.test"):
        monkeypatch.setenv("AGENTTREE_STUDIO_PUBLIC_ORIGIN", invalid)
        with pytest.raises(ValueError, match="HTTPS origin"):
            _ = Settings().public_origin
