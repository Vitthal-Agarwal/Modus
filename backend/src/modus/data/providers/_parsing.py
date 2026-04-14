"""Shared natural-language parsers for web/agent provider responses.

Providers that hit web-search or LLM-agent endpoints get back unstructured
text and have to dig numbers out. Keeping the regex + sanity range in one
place means Firecrawl and Octagon can't drift apart on what counts as a
valid EV/Revenue multiple.
"""

from __future__ import annotations

import re

_EV_PHRASE = r"(?:ev|enterprise\s*value)\s*/\s*(?:revenue|sales)"

# Number must sit within ~30 chars of an EV/Revenue (or Enterprise Value/Revenue)
# anchor. Works in either order: "EV/Revenue of 8.2x" or "8.2x EV/Sales".
_MULTIPLE_RE = re.compile(
    rf"(?:{_EV_PHRASE}[^0-9]{{0,30}}(\d{{1,3}}(?:\.\d{{1,2}})?)\s*x?"
    rf"|(\d{{1,3}}(?:\.\d{{1,2}})?)\s*x?\s*{_EV_PHRASE})",
    re.IGNORECASE,
)


def parse_ev_revenue_multiple(text: str) -> float | None:
    """Return the first plausible EV/Revenue multiple found in `text`, or None.

    Requires an explicit EV/Revenue anchor near the number so Price/Sales,
    Price/Book, and stray year/percentage figures can't masquerade as multiples.
    """
    for m in _MULTIPLE_RE.finditer(text):
        raw = m.group(1) or m.group(2)
        val = float(raw)
        if 0.1 <= val <= 200:
            return val
    return None
