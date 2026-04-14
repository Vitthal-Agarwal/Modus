import { type NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.MODUS_API_BASE || "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "missing ?q= parameter" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${API_BASE}/research?q=${encodeURIComponent(q)}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
