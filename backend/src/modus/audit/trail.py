"""Audit trail builder.

The trail is an append-only sequence of `AuditStep`s. Each method owns its
own builder, and the engine concatenates them into the final output.
"""

from __future__ import annotations

from typing import Any

from modus.core.models import Assumption, AuditStep, Citation, MethodName


class AuditTrailBuilder:
    def __init__(self, method: MethodName | str = "engine") -> None:
        self.method = method
        self._steps: list[AuditStep] = []
        self._counter = 0

    def record(
        self,
        description: str,
        *,
        inputs: dict[str, Any] | None = None,
        outputs: dict[str, Any] | None = None,
        citations: list[Citation] | None = None,
        assumptions: list[Assumption] | None = None,
    ) -> AuditStep:
        self._counter += 1
        step = AuditStep(
            step=self._counter,
            method=self.method,  # type: ignore[arg-type]
            description=description,
            inputs=inputs or {},
            outputs=outputs or {},
            citations=citations or [],
            assumptions=assumptions or [],
        )
        self._steps.append(step)
        return step

    @property
    def steps(self) -> list[AuditStep]:
        return list(self._steps)

    def all_citations(self) -> list[Citation]:
        out: list[Citation] = []
        for s in self._steps:
            out.extend(s.citations)
        return out

    def all_assumptions(self) -> list[Assumption]:
        out: list[Assumption] = []
        for s in self._steps:
            out.extend(s.assumptions)
        return out
