import { type NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.MODUS_API_BASE || "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const q = body.q;
  if (!q) {
    return NextResponse.json({ error: "missing q field" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${API_BASE}/audit/research?q=${encodeURIComponent(q)}`,
      { method: "POST", cache: "no-store" },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), hint: `Is uvicorn running at ${API_BASE}?` },
      { status: 502 },
    );
  }
}
