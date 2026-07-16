import { NextResponse } from "next/server";
import { demoState } from "@/lib/demo-data";

export async function GET() {
  return NextResponse.json({
    provider: "demo",
    delayed: true,
    asOf: "2026-07-14T18:00:00Z",
    disclaimer: "Tanıtım amaçlı demo veridir; gerçek zamanlı değildir.",
    assets: demoState.assets,
  }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
