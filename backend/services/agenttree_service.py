"""Narrow integration boundary around the external AgentTree package."""

from importlib import import_module
from importlib.metadata import PackageNotFoundError, version

from backend.schemas.health import AgentTreeStatus


def get_agenttree_status() -> AgentTreeStatus:
    """Import AgentTree and return a safe, structured availability result."""
    try:
        package = import_module("agenttree")
        package_version = getattr(package, "__version__", None)
        if package_version is None:
            try:
                package_version = version("agenttree")
            except PackageNotFoundError:
                package_version = None
        return AgentTreeStatus(available=True, version=package_version)
    except Exception as exc:  # Import failures may include optional dependency errors.
        return AgentTreeStatus(
            available=False,
            error=f"{type(exc).__name__}: {exc}",
        )
