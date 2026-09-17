"""Primary English and Thai product resources must remain structurally aligned."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "frontend" / "src" / "locales"


def flatten(value: dict, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, item in value.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(item, dict):
            keys.update(flatten(item, path))
        else:
            keys.add(path)
    return keys


def test_thai_and_english_cover_same_primary_product_keys() -> None:
    english = json.loads((ROOT / "en" / "translation.json").read_text())
    thai = json.loads((ROOT / "th" / "translation.json").read_text())

    assert flatten(english) == flatten(thai)
    for namespace in (
        "nav", "dashboard", "trees", "agents", "tools", "runs",
        "providers", "secrets", "settings", "common", "status", "errors",
    ):
        assert namespace in english
        assert namespace in thai
