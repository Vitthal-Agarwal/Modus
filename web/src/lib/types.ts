// TypeScript mirror of the Pydantic models from backend/src/modus/core/models.py.
// Keep in sync with the Python schema.

export type MethodName = "comps" | "dcf" | "last_round" | "precedent_txns";

export type Sector =
  | "ai_saas"
  | "vertical_saas"
  | "fintech"
  | "marketplace"
  | "consumer";

export interface Citation {
  source: string;
  field: string;
  value: number | string;
  as_of: string;
  url?: string | null;
  note?: string | null;
}

export interface Assumption {
  name: string;
  value: number | string;
  rationale: string;
  citation?: Citation | null;
}

export interface AuditStep {
  step: number;
  method: MethodName | "engine";
  description: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  citations: Citation[];
  assumptions: Assumption[];
}

export interface Range {
  low: number;
  base: number;
  high: number;
}

export interface MethodResult {
  method: MethodName;
  range: Range;
  weight: number;
  confidence: number;
  assumptions: Assumption[];
  steps: AuditStep[];
  citations: Citation[];
  summary: string;
}

export interface ValuationOutput {
  company: string;
  sector: Sector;
  as_of: string;
  fair_value: Range;
  methods: MethodResult[];
  audit_trail: AuditStep[];
  citations: Citation[];
  summary: string;
}

export interface CompanyFixture {
  name: string;
  sector: Sector;
  ltm_revenue: number;
  revenue_growth: number;
  ebit_margin: number;
  target_ebit_margin?: number | null;
  tax_rate?: number | null;
  capex_pct_revenue?: number | null;
  wc_pct_revenue?: number | null;
  last_round_post_money?: number | null;
  last_round_date?: string | null;
  last_round_size?: number | null;
  last_round_investors?: string[];
  methods?: MethodName[];
  weights?: Partial<Record<MethodName, number>> | null;
  as_of?: string | null;
  research_citations?: Citation[];
}

export interface ResearchResult {
  input: CompanyFixture;
  sources: Citation[];
  confidence: number;
  provider: string;
}

export function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) {
    return `$${(v / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1 })}B`;
  }
  return `$${(v / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
}

export function fmtPercent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}
