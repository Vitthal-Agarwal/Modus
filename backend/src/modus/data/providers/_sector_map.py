"""Map free-text sector/industry descriptions to the Modus Sector enum."""

from __future__ import annotations

from modus.core.models import Sector

_RULES: list[tuple[list[str], Sector]] = [
    (["artificial intelligence", "machine learning", "llm", "ai platform",
      "generative ai", "deep learning", "nlp", "computer vision"], "ai_saas"),
    (["saas", "software as a service", "cloud software", "enterprise software",
      "application software"], "ai_saas"),
    (["construction tech", "proptech", "real estate tech", "agtech",
      "healthcare it", "edtech", "legal tech", "vertical saas",
      "industry-specific"], "vertical_saas"),
    (["payment", "banking", "insurance", "lending", "neobank", "crypto",
      "blockchain", "defi", "capital markets", "financial", "fintech",
      "wealth management", "regtech"], "fintech"),
    (["marketplace", "e-commerce", "ecommerce", "two-sided", "platform",
      "gig economy", "logistics", "delivery"], "marketplace"),
    (["consumer", "social", "gaming", "entertainment", "media", "food",
      "retail", "fashion", "travel", "hospitality", "fitness"], "consumer"),
]


def classify_sector(text: str | None) -> tuple[Sector, float]:
    if not text:
        return "ai_saas", 0.1
    lower = text.lower()
    for keywords, sector in _RULES:
        for kw in keywords:
            if kw in lower:
                return sector, 0.7
    return "ai_saas", 0.2
