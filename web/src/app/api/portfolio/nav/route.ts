import { NextResponse } from "next/server";

const API_BASE = process.env.MODUS_API_BASE || "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/portfolio/nav`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: String(err),
        hint: `Is uvicorn running at ${API_BASE}? Start with: uv run uvicorn modus.api:app --reload`,
      },
      { status: 502 },
    );
  }
}
