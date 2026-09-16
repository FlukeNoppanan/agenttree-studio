"""Checks for the external AgentTree integration boundary."""

import backend.services.agenttree_service as agenttree_service
import agenttree

from backend.services.agenttree_service import get_agenttree_status


def test_agenttree_package_is_available() -> None:
    status = get_agenttree_status()

    assert status.available is True
    assert status.version == agenttree.__version__
    assert status.error is None


def test_agenttree_import_failure_is_reported(monkeypatch) -> None:
    def fail_import(_: str) -> None:
        raise ImportError("package is unavailable")

    monkeypatch.setattr(agenttree_service, "import_module", fail_import)

    status = agenttree_service.get_agenttree_status()

    assert status.available is False
    assert status.version is None
    assert status.error == "ImportError: package is unavailable"
