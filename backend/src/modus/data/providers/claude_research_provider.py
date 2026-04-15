"""Claude Agent SDK research provider — deep research for unknown companies.

When the cheaper providers (yfinance, Octagon, Firecrawl) all raise ProviderError
for a company_profile lookup, this provider spawns a Claude agent via the
`claude-agent-sdk`. The agent has access to WebSearch and a Firecrawl scrape tool
and is forced to finish by calling a terminal `submit_research` tool whose JSON
schema matches CompanyProfile.

Citation contract (enforced in Python, not trusted to the model): every numeric
field is paired with a *_source_url field. Values without a valid http(s) URL
are dropped to None before constructing the CompanyProfile. The whole point is
that an audit tool must never hallucinate numbers without a source.

Requires ANTHROPIC_API_KEY (and Claude Code CLI, which the SDK subprocesses into).
Only invoked for company_profile; peer_multiples / index_return / risk_free_rate
raise ProviderError so the chain skips past.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import date
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    create_sdk_mcp_server,
    query,
    tool,
)
from claude_agent_sdk.types import TextBlock, ThinkingBlock, ToolUseBlock

from modus.core.models import Citation
from modus.data.cache import get_or_compute
from modus.data.providers import _env  # noqa: F401 — side-effect: load backend/.env
from modus.data.stream import emit
from modus.data.providers.base import (
    CompanyProfile,
    IndexReturn,
    PeerMultiples,
    ProviderError,
    RiskFreeRate,
)
from modus.data.providers.firecrawl_provider import FirecrawlProvider

log = logging.getLogger(__name__)

_URL_RE = re.compile(r"^https?://", re.IGNORECASE)
_MAX_TURNS = 8

_SYSTEM_PROMPT = (
    "You are a senior VC research analyst for the Modus audit tool. You have "
    "three tools: WebSearch (Anthropic server-side), firecrawl_scrape (for "
    "fetching specific pages when the summary isn't enough), and submit_research "
    "(terminal — you MUST call this exactly once to finish).\n\n"
    "Your job: given a company name, find LTM revenue (USD), revenue growth "
    "(decimal, e.g. 0.5 for 50%), EBIT margin (decimal), last round post-money "
    "valuation (USD), last round date (ISO), and sector. For EVERY numeric value "
    "you return, include a direct source URL (Crunchbase, SEC filing, reputable "
    "news) that actually states the number. If you cannot find a sourced number, "
    "leave it null — missing data is ACCEPTABLE and expected. Never guess. "
    "Never estimate. Never average multiple guesses. Nulls are strictly better "
    "than unsourced numbers because this is an audit tool.\n\n"
    "IMPORTANT — last round: if you submit last_round_post_money_usd you MUST "
    "also submit last_round_date (the ISO date of that specific funding round, "
    "e.g. '2023-03-15'). Without the date the valuation cannot be marked to "
    "market and will be discarded. Search Crunchbase or TechCrunch for the "
    "exact close date of that round. Use the most recent primary funding round "
    "(not secondary transactions or IPO estimates).\n\n"
    "Work efficiently: 1-3 web searches then submit. End by calling submit_research."
)


@tool(
    "firecrawl_scrape",
    "Fetch and parse a specific URL via Firecrawl when a web_search summary isn't enough.",
    {"url": str},
)
async def _firecrawl_scrape(args: dict[str, Any]) -> dict[str, Any]:
    try:
        fc = FirecrawlProvider()
        results = fc._search(args["url"])
        text = "\n\n".join(
            f"{r.get('title', '')}\n{r.get('description') or r.get('markdown') or ''}"
            for r in results[:3]
        )
        return {"content": [{"type": "text", "text": text[:4000] or "(no content)"}]}
    except Exception as e:
        return {"content": [{"type": "text", "text": f"firecrawl_scrape failed: {e}"}]}


_SUBMIT_SCHEMA: dict[str, Any] = {
    "name": {"type": "string"},
    "sector": {"type": ["string", "null"]},
    "ltm_revenue_usd": {"type": ["number", "null"]},
    "ltm_revenue_source_url": {"type": ["string", "null"]},
    "revenue_growth": {"type": ["number", "null"]},
    "revenue_growth_source_url": {"type": ["string", "null"]},
    "ebit_margin": {"type": ["number", "null"]},
    "ebit_margin_source_url": {"type": ["string", "null"]},
    "last_round_post_money_usd": {"type": ["number", "null"]},
    "last_round_post_money_source_url": {"type": ["string", "null"]},
    "last_round_date": {"type": ["string", "null"]},
    "description": {"type": ["string", "null"]},
    "confidence_notes": {"type": "string"},
}


def _make_submit_tool(sink: dict[str, Any]):
    @tool(
        "submit_research",
        "Finalize your research. Call this exactly once with all fields you found.",
        _SUBMIT_SCHEMA,
    )
    async def _submit(args: dict[str, Any]) -> dict[str, Any]:
        sink["payload"] = args
        return {"content": [{"type": "text", "text": "Research recorded. Stop now."}]}

    return _submit


def _should_skip() -> bool:
    return os.environ.get("MODUS_FORCE_MOCK") == "1"


def _build_profile(query_name: str, payload: dict[str, Any]) -> CompanyProfile:
    today = date.today()
    citations: list[Citation] = []

    def _cite(audit_field: str, value_key: str, url_key: str) -> float | None:
        value = payload.get(value_key)
        url = payload.get(url_key)
        if value is None or not isinstance(url, str) or not _URL_RE.match(url):
            return None
        citations.append(
            Citation(
                source="claude-agent",
                field=audit_field,
                value=float(value),
                as_of=today,
                url=url,
            )
        )
        return float(value)

    ltm_revenue = _cite("ltm_revenue", "ltm_revenue_usd", "ltm_revenue_source_url")
    growth = _cite("revenue_growth", "revenue_growth", "revenue_growth_source_url")
    margin = _cite("ebit_margin", "ebit_margin", "ebit_margin_source_url")
    last_round = _cite(
        "last_round_post_money",
        "last_round_post_money_usd",
        "last_round_post_money_source_url",
    )

    last_round_date: date | None = None
    lrd_raw = payload.get("last_round_date")
    if isinstance(lrd_raw, str):
        try:
            last_round_date = date.fromisoformat(lrd_raw)
        except ValueError:
            last_round_date = None

    fields_tracked = 5
    filled = sum(
        1 for v in [ltm_revenue, growth, margin, last_round, last_round_date] if v is not None
    )
    confidence = round(filled / fields_tracked, 2)

    return CompanyProfile(
        name=payload.get("name") or query_name,
        ticker=None,
        sector=payload.get("sector"),
        ltm_revenue=ltm_revenue,
        revenue_growth=growth,
        ebit_margin=margin,
        last_round_post_money=last_round,
        last_round_date=last_round_date,
        description=payload.get("description"),
        citations=citations,
        confidence=confidence,
    )


async def _run_agent(query_name: str) -> dict[str, Any]:
    sink: dict[str, Any] = {}
    submit_tool = _make_submit_tool(sink)
    mcp_server = create_sdk_mcp_server(
        name="modus",
        version="0.1.0",
        tools=[_firecrawl_scrape, submit_tool],
    )
    options = ClaudeAgentOptions(
        system_prompt=_SYSTEM_PROMPT,
        mcp_servers={"modus": mcp_server},
        allowed_tools=[
            "WebSearch",
            "mcp__modus__firecrawl_scrape",
            "mcp__modus__submit_research",
        ],
        max_turns=_MAX_TURNS,
        permission_mode="bypassPermissions",
    )
    prompt = (
        f"Research the company '{query_name}'. Find LTM revenue, revenue growth, "
        "EBIT margin, last round post-money, last round date, and sector. "
        "Every number must have a direct source URL. Call submit_research to finish."
    )
    turn = 0
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            turn += 1
            for block in message.content:
                if isinstance(block, (TextBlock, ThinkingBlock)):
                    text = block.text.strip() if hasattr(block, "text") else ""
                    if text:
                        # Emit first 300 chars of any reasoning text
                        emit({"type": "agent_thinking", "text": text[:300], "turn": turn})
                elif isinstance(block, ToolUseBlock):
                    summary = _tool_summary(block.name, block.input)
                    emit({
                        "type": "agent_tool_call",
                        "tool": block.name,
                        "summary": summary,
                        "turn": turn,
                    })
            if "payload" in sink:
                fields_found = [k for k, v in sink["payload"].items() if v is not None and k not in ("name", "confidence_notes", "description")]
                emit({"type": "agent_done", "fields": fields_found})
                break
    if "payload" not in sink:
        raise ProviderError("claude agent finished without calling submit_research")
    return sink["payload"]


def _tool_summary(tool_name: str, tool_input: dict[str, Any]) -> str:
    """Return a short human-readable summary of a tool call."""
    if tool_name == "WebSearch":
        return tool_input.get("query", "")[:120]
    if tool_name == "firecrawl_scrape":
        url = tool_input.get("url", "")
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.netloc + (parsed.path[:40] if parsed.path else "")
        except Exception:
            return url[:80]
    if tool_name == "submit_research":
        fields = [k for k, v in tool_input.items() if v is not None and k not in ("name", "confidence_notes", "description")]
        return f"submitting {len(fields)} fields: {', '.join(fields[:5])}"
    return str(tool_input)[:80]


class ClaudeResearchProvider:
    """Deep-research fallback via Claude Agent SDK. Only handles company_profile."""

    name = "claude-agent"

    def __init__(self) -> None:
        self._api_key = os.environ.get("ANTHROPIC_API_KEY")

    def _require_key(self) -> None:
        if _should_skip():
            raise ProviderError("MODUS_FORCE_MOCK=1")
        if not self._api_key:
            raise ProviderError("ANTHROPIC_API_KEY not set")

    def peer_multiples(self, tickers: list[str]) -> list[PeerMultiples]:
        raise ProviderError("claude-agent does not serve peer_multiples (hallucination risk)")

    def index_return(self, ticker: str, start: date, end: date) -> IndexReturn:
        raise ProviderError("claude-agent does not serve index_return (hallucination risk)")

    def risk_free_rate(self, as_of: date) -> RiskFreeRate:
        raise ProviderError("claude-agent does not serve risk_free_rate (hallucination risk)")

    def company_profile(self, query: str) -> CompanyProfile:
        self._require_key()
        today = date.today()

        def _compute() -> dict[str, Any]:
            try:
                return asyncio.run(_run_agent(query))
            except ProviderError:
                raise
            except Exception as e:
                raise ProviderError(f"claude agent failed: {e}") from e

        payload = get_or_compute(
            "claude_research_profile",
            query.strip().lower(),
            today,
            _compute,
        )
        if not payload:
            raise ProviderError("claude agent returned empty payload")
        return _build_profile(query, payload)
