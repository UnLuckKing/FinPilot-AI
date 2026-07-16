import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  question: z.string().trim().min(2).max(500),
  context: z.object({
    portfolioValue: z.number().nonnegative(),
    riskScore: z.number().min(0).max(100),
    monthlyBudget: z.number().nonnegative(),
    emergencyPercent: z.number().min(0).max(100),
  }),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  const { question, context } = parsed.data;
  const answer = `Portföy değerin ₺${Math.round(context.portfolioValue).toLocaleString("tr-TR")}, risk puanın ${context.riskScore.toFixed(0)}/100 ve dengeli aylık bütçen ₺${Math.round(context.monthlyBudget).toLocaleString("tr-TR")}. “${question.slice(0, 80)}” sorusu bu kayıtlı veriler temelinde değerlendirildi. Eksik piyasa verileri tahmin edilmedi.`;
  return NextResponse.json({ provider: "demo-rule-based", answer, factsOnly: true });
}
