import { NextResponse } from "next/server";

/** Legado do stub Cloud API — o canal real é Evolution em /api/agent/webhook. */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "use_evolution",
      webhook: "/api/agent/webhook",
    },
    { status: 410 },
  );
}
