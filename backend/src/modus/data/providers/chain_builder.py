"""Assemble the default provider chain based on environment variables.

Chain order (first to last):
1. YFinance (public peer multiples, index returns)
2. FRED (risk-free rate)
3. Octagon (private-market comps via agent API — needs OCTAGON_API_KEY)
4. Firecrawl (web-search fallback for peer multiples — needs FIRECRAWL_API_KEY)
5. Mock (always succeeds)

Octagon sits ahead of Firecrawl because structured private-market data beats
regex'd search snippets when a key is available; Firecrawl still catches
tickers Octagon can't resolve. Both degrade cleanly (ProviderError) with no
key set, and mock remains the final backstop.

Set `MODUS_FORCE_MOCK=1` to skip all live providers.
"""

from __future__ import annotations

from modus.data.providers.base import ProviderChain
from modus.data.providers.firecrawl_provider import FirecrawlProvider
from modus.data.providers.fred_provider import FredProvider
from modus.data.providers.mock_provider import MockProvider
from modus.data.providers.octagon_provider import OctagonProvider
from modus.data.providers.yfinance_provider import YFinanceProvider


def build_default_chain() -> ProviderChain:
    return ProviderChain([
        YFinanceProvider(),
        FredProvider(),
        OctagonProvider(),
        FirecrawlProvider(),
        MockProvider(),
    ])
