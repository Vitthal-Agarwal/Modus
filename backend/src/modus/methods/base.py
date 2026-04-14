"""Valuation method protocol. Each method is a plugin that the engine composes."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from modus.core.models import CompanyInput, MethodName, MethodResult


@runtime_checkable
class ValuationMethod(Protocol):
    """A valuation methodology. Implementations live in `modus.methods.*`."""

    name: MethodName

    def run(self, company: CompanyInput) -> MethodResult:
        """Run the method and return a structured `MethodResult`.

        Must not raise on missing external data — degrade gracefully and reflect
        the data source (live vs. mock) in the returned citations.
        """
        ...
