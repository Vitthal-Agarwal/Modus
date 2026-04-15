"""Render a ValuationOutput to a PDF audit report via reportlab.

Mirrors the structure of audit/report.render_markdown: fair-value header,
method breakdown table, DCF sensitivity grid (if present), audit trail,
and a deduped citation list. The output is a print-ready A4 document an
auditor can hand to a reviewer alongside the .md / .json exports.
"""

from __future__ import annotations

import io
import json
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from modus.core.models import ValuationOutput


def _fmt_money(v: float) -> str:
    return f"${v / 1e6:,.1f}M"


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontSize=18,
            leading=22,
            spaceAfter=6,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontSize=13,
            leading=16,
            spaceBefore=12,
            spaceAfter=6,
            textColor=colors.HexColor("#1f2937"),
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontSize=10,
            leading=12,
            spaceBefore=8,
            spaceAfter=2,
            textColor=colors.HexColor("#374151"),
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontSize=9,
            leading=12,
        ),
        "mono": ParagraphStyle(
            "mono",
            parent=base["BodyText"],
            fontName="Courier",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#4b5563"),
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base["BodyText"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#6b7280"),
        ),
    }


def _header_table(output: ValuationOutput) -> Table:
    fv = output.fair_value
    data = [
        ["Low", "Base", "High"],
        [_fmt_money(fv.low), _fmt_money(fv.base), _fmt_money(fv.high)],
    ]
    t = Table(data, colWidths=[55 * mm, 55 * mm, 55 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 12),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (1, 1), (1, 1), "Helvetica-Bold"),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#f3f4f6")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def _method_breakdown_table(output: ValuationOutput) -> Table:
    rows: list[list[str]] = [["Method", "Weight", "Confidence", "Low", "Base", "High"]]
    for m in output.methods:
        rows.append(
            [
                m.method,
                f"{m.weight:.0%}",
                f"{m.confidence:.0%}",
                _fmt_money(m.range.low),
                _fmt_money(m.range.base),
                _fmt_money(m.range.high),
            ]
        )
    t = Table(rows, colWidths=[35 * mm, 20 * mm, 25 * mm, 30 * mm, 30 * mm, 30 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def _sensitivity_block(output: ValuationOutput) -> list[Any]:
    step = next(
        (
            s
            for s in output.audit_trail
            if s.method == "dcf" and isinstance(s.outputs, dict) and "grid" in s.outputs
        ),
        None,
    )
    if step is None:
        return []
    out = step.outputs
    waccs = out.get("wacc_values") or []
    gs = out.get("growth_values") or []
    grid = out.get("grid") or []
    if not (waccs and gs and grid):
        return []

    styles = _styles()
    rows: list[list[str]] = [["WACC \\ g", *[f"{g:.1%}" for g in gs]]]
    for wacc, row in zip(waccs, grid, strict=True):
        rows.append([f"{wacc:.1%}", *[f"{v / 1e6:,.0f}" for v in row]])

    col_widths = [25 * mm] + [30 * mm] * len(gs)
    t = Table(rows, colWidths=col_widths)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0f2fe")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e0f2fe")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#bfdbfe")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )

    return [
        Paragraph("DCF sensitivity (EV, $M)", styles["h2"]),
        Paragraph(
            "WACC × terminal growth, ±1pp each. Illiquidity discount not applied.",
            styles["meta"],
        ),
        Spacer(1, 4),
        t,
    ]


def _audit_trail_flowables(output: ValuationOutput) -> list[Any]:
    styles = _styles()
    flow: list[Any] = [Paragraph("Audit trail", styles["h2"])]
    for step in output.audit_trail:
        title = f"Step {step.step} — {step.method}: {step.description}"
        flow.append(Paragraph(_escape(title), styles["h3"]))
        if step.inputs:
            flow.append(
                Paragraph(
                    f"<b>Inputs:</b> {_escape(json.dumps(step.inputs, default=str))}",
                    styles["mono"],
                )
            )
        if step.outputs:
            flow.append(
                Paragraph(
                    f"<b>Outputs:</b> {_escape(json.dumps(step.outputs, default=str))}",
                    styles["mono"],
                )
            )
        if step.assumptions:
            for a in step.assumptions:
                cite = f" (cite: {a.citation.source})" if a.citation else ""
                flow.append(
                    Paragraph(
                        f"<b>Assumption</b> <font face='Courier'>{_escape(a.name)}</font>"
                        f" = {_escape(str(a.value))} — {_escape(a.rationale)}{_escape(cite)}",
                        styles["body"],
                    )
                )
        if step.citations:
            for c in step.citations:
                url = f" — {c.url}" if c.url else ""
                flow.append(
                    Paragraph(
                        f"<b>Cite</b> <font face='Courier'>{_escape(c.source)}</font>"
                        f" / {_escape(c.field)} = {_escape(str(c.value))}"
                        f" (as of {c.as_of.isoformat()}){_escape(url)}",
                        styles["body"],
                    )
                )
        flow.append(Spacer(1, 4))
    return flow


def _citations_flowables(output: ValuationOutput) -> list[Any]:
    styles = _styles()
    flow: list[Any] = [Paragraph("All citations", styles["h2"])]
    seen: set[tuple[str, str]] = set()
    for c in output.citations:
        key = (c.source, c.field)
        if key in seen:
            continue
        seen.add(key)
        url = f" — {c.url}" if c.url else ""
        flow.append(
            Paragraph(
                f"<b>{_escape(c.source)}</b> — {_escape(c.field)}:"
                f" {_escape(str(c.value))} (as of {c.as_of.isoformat()}){_escape(url)}",
                styles["body"],
            )
        )
    return flow


def _escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def render_pdf(output: ValuationOutput) -> bytes:
    """Render a ValuationOutput to a print-ready A4 PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Valuation Audit — {output.company}",
        author="Modus",
    )

    styles = _styles()
    story: list[Any] = [
        Paragraph(f"Valuation Audit — {_escape(output.company)}", styles["title"]),
        Paragraph(
            f"Sector: <font face='Courier'>{_escape(output.sector)}</font>"
            f" &nbsp;·&nbsp; As of: {output.as_of.isoformat()}",
            styles["meta"],
        ),
        Spacer(1, 10),
        Paragraph("Fair value", styles["h2"]),
        _header_table(output),
        Spacer(1, 10),
    ]

    if output.summary:
        story.append(Paragraph("Summary", styles["h2"]))
        for line in output.summary.splitlines():
            if line.strip():
                story.append(Paragraph(f"• {_escape(line)}", styles["body"]))
        story.append(Spacer(1, 6))

    story.append(Paragraph("Method breakdown", styles["h2"]))
    story.append(_method_breakdown_table(output))
    story.append(Spacer(1, 10))

    story.extend(_sensitivity_block(output))
    story.append(PageBreak())
    story.extend(_audit_trail_flowables(output))
    story.append(PageBreak())
    story.extend(_citations_flowables(output))

    doc.build(story)
    return buf.getvalue()
