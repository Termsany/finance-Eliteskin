import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureBudget } from "@/lib/samples";
import { riyadhToday } from "@/lib/riyadh-day";

const SHARED_KEY = process.env.SHARED_API_KEY;
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const auth = req.headers.get("x-api-key");
  if (!SHARED_KEY || auth !== SHARED_KEY) return forbid();

  const url = new URL(req.url);
  const month = url.searchParams.get("month") || riyadhToday().slice(0, 7);
  const repName = url.searchParams.get("rep");

  const reps = (await query<{ id: number; name: string; product_name: string | null; sample_pct: string | null; promo_pct: string | null }>(
    `SELECT r.id, r.name, p.name as product_name, r.sample_pct::text, r.promo_pct::text
     FROM reps r LEFT JOIN daftra_products p ON p.id = r.product_id
     WHERE r.active ${repName ? "AND r.name = $1" : ""} ORDER BY r.name`,
    repName ? [repName] : []
  )).rows;

  const result = await Promise.all(reps.map(async (r) => {
    const budget = await ensureBudget(r.id, month).catch(() => null);

    const samplesUsed = (await query<{ total: string }>(
      "SELECT COALESCE(SUM(total_units), 0) as total FROM sample_records WHERE rep_id=$1 AND month=$2", [r.id, month]
    )).rows[0];

    const samplesCost = (await query<{ total: string }>(
      "SELECT COALESCE(SUM(total_cost), 0) as total FROM sample_records WHERE rep_id=$1 AND month=$2", [r.id, month]
    )).rows[0];

    const promoUsed = (await query<{ total: string }>(
      "SELECT COALESCE(SUM(amount), 0) as total FROM promo_expenses WHERE rep_id=$1 AND month=$2", [r.id, month]
    )).rows[0];

    const promoByType = (await query<{ promo_type: string; total: string }>(
      "SELECT promo_type, SUM(amount)::text as total FROM promo_expenses WHERE rep_id=$1 AND month=$2 GROUP BY promo_type", [r.id, month]
    )).rows;

    return {
      rep_name: r.name,
      product_name: r.product_name,
      sample_pct: Number(r.sample_pct || budget?.sample_pct || 0),
      promo_pct: Number(r.promo_pct || budget?.promo_pct || 0),
      samples: {
        budget_units: budget?.sample_budget || 0,
        used_units: Number(samplesUsed?.total || 0),
        used_cost: Number(samplesCost?.total || 0),
        remaining_units: (budget?.sample_budget || 0) - Number(samplesUsed?.total || 0),
      },
      promo: {
        budget_amount: budget?.promo_budget || 0,
        used_amount: Number(promoUsed?.total || 0),
        remaining_amount: (budget?.promo_budget || 0) - Number(promoUsed?.total || 0),
        by_type: Object.fromEntries(promoByType.map(p => [p.promo_type, Number(p.total)])),
      },
      prev_month: {
        units: budget?.prev_units || 0,
        sales: budget?.prev_sales || 0,
        unit_cost: budget?.unit_cost || 0,
      },
    };
  }));

  return NextResponse.json({ month, reps: result });
}
