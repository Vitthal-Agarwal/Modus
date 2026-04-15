"""Smoke tests to verify the package imports and scaffolding is intact."""

from __future__ import annotations

import modus


def test_version() -> None:
    assert modus.__version__ == "0.1.0"


def test_cli_imports() -> None:
    from modus.cli import app

    assert app is not None


def test_api_imports() -> None:
    from modus.api import app

    assert app is not None
