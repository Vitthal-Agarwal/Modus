import { type NextRequest } from "next/server";

const API_BASE = process.env.MODUS_API_BASE || "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) {
    return new Response(JSON.stringify({ error: "missing ?q=" }), { status: 400 });
  }

  const upstream = await fetch(
    `${API_BASE}/research/stream?q=${encodeURIComponent(q)}`,
    { cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: "upstream failed" }), { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
