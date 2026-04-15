import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.MODUS_API_BASE || "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ idA: string; idB: string }> },
) {
  try {
    const { idA, idB } = await params;
    const res = await fetch(`${API_BASE}/scenarios/diff/${idA}/${idB}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
