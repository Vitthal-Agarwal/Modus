"""Thread-safe event emitter for streaming research progress to the frontend.

Providers and agent loops call `emit()` to push structured events.  The SSE
endpoint in api.py wires a callback via `set_callback()` before running the
provider chain in a thread executor.  Because `asyncio.run()` creates a new
event loop on the *same* thread, the thread-id key stays consistent across
all emit() calls even from inside the async agent loop.
"""

from __future__ import annotations

import threading
from typing import Any, Callable

_lock = threading.Lock()
_callbacks: dict[int, Callable[[dict[str, Any]], None]] = {}


def set_callback(callback: Callable[[dict[str, Any]], None]) -> None:
    with _lock:
        _callbacks[threading.get_ident()] = callback


def clear_callback() -> None:
    with _lock:
        _callbacks.pop(threading.get_ident(), None)


def emit(event: dict[str, Any]) -> None:
    with _lock:
        cb = _callbacks.get(threading.get_ident())
    if cb is not None:
        try:
            cb(event)
        except Exception:
            pass
