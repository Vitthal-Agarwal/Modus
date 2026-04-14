"""Typer CLI for the Modus VC Audit Tool.

Primary command: `modus audit` — run a valuation audit against a company
input (either a built-in fixture or explicit flags) and print a rich report
to the terminal. Optionally write Markdown / JSON audit reports to disk.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from modus import __version__
from modus.audit.report import render_json, render_markdown
from modus.core.engine import Engine
from modus.core.models import CompanyInput, MethodName, Sector, ValuationOutput
from modus.data.fixtures_loader import load_companies, load_company
from modus.data.providers.chain_builder import build_default_chain
from modus.data.providers.mock_provider import MockProvider

app = typer.Typer(
    name="modus",
    help="Modus — VC Audit Tool. Independent portfolio valuation via Comps, DCF, and Last Round.",
    no_args_is_help=True,
    rich_markup_mode="rich",
)
console = Console()


def _build_engine() -> Engine:
    return Engine(build_default_chain())


def _fmt_money(v: float) -> str:
    return f"${v/1e6:,.1f}M"


def _print_report(out: ValuationOutput) -> None:
    title = f"[bold]{out.company}[/bold]  ·  [dim]{out.sector}[/dim]  ·  {out.as_of.isoformat()}"
    headline = (
        f"[bold green]{_fmt_money(out.fair_value.base)}[/bold green]  "
        f"([dim]{_fmt_money(out.fair_value.low)} – {_fmt_money(out.fair_value.high)}[/dim])"
    )
    console.print(Panel.fit(f"{title}\n\nFair value: {headline}", border_style="cyan"))

    t = Table(title="Method breakdown", show_lines=False)
    t.add_column("Method", style="bold")
    t.add_column("Weight", justify="right")
    t.add_column("Confidence", justify="right")
    t.add_column("Low", justify="right")
    t.add_column("Base", justify="right", style="green")
    t.add_column("High", justify="right")
    for m in out.methods:
        t.add_row(
            m.method,
            f"{m.weight:.0%}",
            f"{m.confidence:.0%}",
            _fmt_money(m.range.low),
            _fmt_money(m.range.base),
            _fmt_money(m.range.high),
        )
    console.print(t)

    console.print(f"\n[bold]Audit trail:[/bold] {len(out.audit_trail)} steps  ·  "
                  f"[bold]Citations:[/bold] {len(out.citations)}")
    for line in out.summary.splitlines():
        console.print(f"  • {line}")


@app.command()
def version() -> None:
    """Print the Modus version."""
    console.print(f"modus [bold]{__version__}[/bold]")


@app.command("companies")
def list_companies() -> None:
    """List available built-in fixture companies."""
    companies = load_companies()
    t = Table(title="Fixture companies")
    t.add_column("Key", style="bold")
    t.add_column("Name")
    t.add_column("Sector")
    t.add_column("LTM Rev", justify="right")
    t.add_column("Last round")
    for key, c in companies.items():
        last_round = (
            f"${c.last_round_post_money/1e6:,.0f}M ({c.last_round_date})"
            if c.last_round_post_money and c.last_round_date
            else "—"
        )
        t.add_row(key, c.name, c.sector, _fmt_money(c.ltm_revenue), last_round)
    console.print(t)


@app.command()
def audit(
    from_fixture: Annotated[
        str | None, typer.Option("--from-fixture", "-f", help="Load input from a built-in fixture (e.g. basis_ai).")
    ] = None,
    company_name: Annotated[str | None, typer.Option("--company", help="Portfolio company name.")] = None,
    sector: Annotated[str | None, typer.Option("--sector", help="Sector code (ai_saas, vertical_saas, fintech, ...)")] = None,
    revenue: Annotated[float | None, typer.Option("--revenue", help="LTM revenue in USD.")] = None,
    growth: Annotated[float | None, typer.Option("--growth", help="YoY growth as decimal (1.5 = 150%).")] = None,
    ebit_margin: Annotated[float | None, typer.Option("--ebit-margin", help="Current EBIT margin as decimal.")] = None,
    methods: Annotated[
        str, typer.Option("--methods", help="Comma-separated methods to run.")
    ] = "comps,dcf,last_round",
    out_dir: Annotated[
        Path | None, typer.Option("--out", "-o", help="Write audit_report.md and audit_report.json to this directory.")
    ] = None,
    json_only: Annotated[bool, typer.Option("--json", help="Print JSON to stdout instead of rich terminal output.")] = False,
) -> None:
    """Run a valuation audit and print a structured report."""
    if from_fixture:
        company = load_company(from_fixture)
    else:
        missing = [k for k, v in {"company": company_name, "sector": sector, "revenue": revenue, "growth": growth, "ebit-margin": ebit_margin}.items() if v is None]
        if missing:
            console.print(f"[red]Missing required flags: {', '.join(missing)}[/red]")
            console.print("Use [bold]--from-fixture basis_ai[/bold] for a quick demo.")
            raise typer.Exit(1)
        company = CompanyInput(
            name=company_name,  # type: ignore[arg-type]
            sector=sector,  # type: ignore[arg-type]
            ltm_revenue=revenue,  # type: ignore[arg-type]
            revenue_growth=growth,  # type: ignore[arg-type]
            ebit_margin=ebit_margin,  # type: ignore[arg-type]
        )

    method_list: list[MethodName] = [m.strip() for m in methods.split(",") if m.strip()]  # type: ignore[misc]
    company = company.model_copy(update={"methods": method_list, "as_of": company.as_of or date.today()})

    engine = _build_engine()
    output = engine.run(company)

    if json_only:
        console.print_json(render_json(output))
    else:
        _print_report(output)

    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "audit_report.md").write_text(render_markdown(output))
        (out_dir / "audit_report.json").write_text(render_json(output))
        console.print(f"\n[green]Wrote[/green] {out_dir / 'audit_report.md'} and audit_report.json")


if __name__ == "__main__":
    app()
