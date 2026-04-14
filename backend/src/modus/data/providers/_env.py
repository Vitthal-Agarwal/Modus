"""Load backend/.env once, at provider-module import time.

Every live provider that needs a secret (OCTAGON_API_KEY, FIRECRAWL_API_KEY,
FRED_API_KEY, …) imports this module for its side effect so any entrypoint
— CLI, API, pytest, python -c — sees the same environment without having to
remember to source the file. `load_dotenv` is idempotent and does not
override variables already set in the real environment, so CI overrides
still win.
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()
