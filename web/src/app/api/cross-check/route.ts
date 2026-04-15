import { NextResponse } from "next/server";

const API_BASE = process.env.MODUS_API_BASE || "http://127.0.0.1:8000";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${API_BASE}/cross-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 502 },
    );
  }
}
