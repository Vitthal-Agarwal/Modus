"""Render a ValuationOutput to Markdown and JSON audit reports."""

from __future__ import annotations

import json
from io import StringIO

from modus.core.models import ValuationOutput


def _fmt_money(v: float) -> str:
    return f"${v/1e6:,.1f}M"


def render_json(output: ValuationOutput) -> str:
    return json.dumps(output.model_dump(mode="json"), indent=2, default=str)


def _render_sensitivity(output: ValuationOutput, w) -> None:
    """Pull the DCF WACC × terminal-g grid out of the audit trail, if present."""
    step = next(
        (
            s for s in output.audit_trail
            if s.method == "dcf" and isinstance(s.outputs, dict) and "grid" in s.outputs
        ),
        None,
    )
    if step is None:
        return
    out = step.outputs
    waccs = out.get("wacc_values") or []
    gs = out.get("growth_values") or []
    grid = out.get("grid") or []
    if not (waccs and gs and grid):
        return
    w("## DCF sensitivity (EV, $M)\n\n")
    w("WACC × terminal growth, ±1pp each. Illiquidity discount **not** applied.\n\n")
    header = "| WACC \\ g |" + "".join(f" {g:.1%} |" for g in gs) + "\n"
    sep = "|---|" + "---|" * len(gs) + "\n"
    w(header)
    w(sep)
    for wacc, row in zip(waccs, grid):
        cells = "".join(f" {v/1e6:,.0f} |" for v in row)
        w(f"| {wacc:.1%} |{cells}\n")
    w("\n")


def render_markdown(output: ValuationOutput) -> str:
    buf = StringIO()
    w = buf.write

    w(f"# Valuation Audit — {output.company}\n\n")
    w(f"**Sector:** `{output.sector}`  \n")
    w(f"**As of:** {output.as_of.isoformat()}\n\n")

    w("## Fair value\n\n")
    w("| Low | Base | High |\n")
    w("|---|---|---|\n")
    w(
        f"| {_fmt_money(output.fair_value.low)} "
        f"| **{_fmt_money(output.fair_value.base)}** "
        f"| {_fmt_money(output.fair_value.high)} |\n\n"
    )

    if output.summary:
        w("### Summary\n\n")
        for line in output.summary.splitlines():
            w(f"- {line}\n")
        w("\n")

    w("## Method breakdown\n\n")
    w("| Method | Weight | Confidence | Low | Base | High |\n")
    w("|---|---|---|---|---|---|\n")
    for m in output.methods:
        w(
            f"| {m.method} | {m.weight:.0%} | {m.confidence:.0%} "
            f"| {_fmt_money(m.range.low)} | {_fmt_money(m.range.base)} | {_fmt_money(m.range.high)} |\n"
        )
    w("\n")

    _render_sensitivity(output, w)

    w("## Audit trail\n\n")
    for step in output.audit_trail:
        w(f"### Step {step.step} — {step.method}: {step.description}\n\n")
        if step.inputs:
            w("**Inputs:** `" + json.dumps(step.inputs, default=str) + "`\n\n")
        if step.outputs:
            w("**Outputs:** `" + json.dumps(step.outputs, default=str) + "`\n\n")
        if step.assumptions:
            w("**Assumptions:**\n\n")
            for a in step.assumptions:
                cite = f" _(cite: {a.citation.source})_" if a.citation else ""
                w(f"- `{a.name}` = {a.value} — {a.rationale}{cite}\n")
            w("\n")
        if step.citations:
            w("**Citations:**\n\n")
            for c in step.citations:
                url = f" — {c.url}" if c.url else ""
                w(f"- `{c.source}` / {c.field} = {c.value} (as of {c.as_of.isoformat()}){url}\n")
            w("\n")

    w("## All citations\n\n")
    seen: set[tuple[str, str]] = set()
    for c in output.citations:
        key = (c.source, c.field)
        if key in seen:
            continue
        seen.add(key)
        url = f" — {c.url}" if c.url else ""
        w(f"- **{c.source}** — {c.field}: {c.value} (as of {c.as_of.isoformat()}){url}\n")

    return buf.getvalue()
