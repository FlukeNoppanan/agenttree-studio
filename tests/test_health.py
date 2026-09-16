"""API contract smoke tests."""

from backend.api.health import health
from backend.main import app


def test_health_reports_backend_and_agenttree() -> None:
    payload = health().model_dump()
    assert payload["status"] == "ok"
    assert payload["service"] == "AgentTree Studio"
    assert payload["version"] == "0.1.0"
    assert payload["agenttree"]["available"] is True
    assert payload["agenttree"]["version"] == "0.2.1"
    assert payload["runtime"]["python_version"]


def test_openapi_document_is_available() -> None:
    assert app.openapi()["info"] == {
        "title": "AgentTree Studio API",
        "version": "0.1.0",
    }
