"""Assemble the default provider chain based on environment variables.

Chain order (first to last):
1. YFinance (peer multiples, index returns)
2. FRED (risk-free rate)
3. Firecrawl (peer multiples fallback via web search — needs FIRECRAWL_API_KEY)
4. Mock (always succeeds)

Set `MODUS_FORCE_MOCK=1` to skip all live providers.
"""

from __future__ import annotations

from modus.data.providers.base import ProviderChain
from modus.data.providers.firecrawl_provider import FirecrawlProvider
from modus.data.providers.fred_provider import FredProvider
from modus.data.providers.mock_provider import MockProvider
from modus.data.providers.yfinance_provider import YFinanceProvider


def build_default_chain() -> ProviderChain:
    return ProviderChain([
        YFinanceProvider(),
        FredProvider(),
        FirecrawlProvider(),
        MockProvider(),
    ])
