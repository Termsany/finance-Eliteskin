import { query } from "@/lib/db";

/* ───────────── Types ───────────── */
export type Rep = { id: number; name: string; product_id: number | null; product_name: string | null; active: boolean; sample_pct: number | null; promo_pct: number | null };
export type RepBudget = { id: number; rep_id: number; month: string; prev_units: number; sample_budget: number; promo_budget: number; sample_pct: number; promo_pct: number; unit_cost: number; prev_sales: number };
export type SampleRecord = { id: number; rep_id: number; month: string; dispensed_at: string; total_units: number; total_cost: number; over_budget: boolean; override_reason: string | null; notes: string };
export type PromoExpense = { id: number; rep_id: number; month: string; expense_date: string; promo_type: PromoType; other_desc: string; amount: number; place: string; doctors: string[]; attendees: number; notes: string; over_budget: boolean; override_reason: string | null };
export type PromoType = "pms" | "lunch" | "rtd" | "other";
export const PROMO_LABELS: Record<PromoType, string> = { pms: "PMS", lunch: "دعوة غداء", rtd: "RTD", other: "أخرى" };

/* ───────────── Helpers ───────────── */
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const prevMonth = (m: string) => { let [y, mo] = m.split("-").map(Number); mo--; if (mo < 1) { mo = 12; y--; } return `${y}-${String(mo).padStart(2, "0")}`; };

/** Units sold for a product in a given month, net of refunds. */
export async function productUnitsSold(productId: number, month: string): Promise<{ units: number; sales: number }> {
  const r = await query<{ units: string; sales: string }>(`
    SELECT COALESCE(SUM(
      it.quantity * CASE WHEN i.payment_status = 3 OR (i.total > 0 AND i.refund >= i.total) THEN 0
                        WHEN i.total > 0 THEN GREATEST(0, 1 - i.refund / i.total) ELSE 1 END
    ), 0) AS units,
    COALESCE(SUM(
      it.net * CASE WHEN i.payment_status = 3 OR (i.total > 0 AND i.refund >= i.total) THEN 0
                    WHEN i.total > 0 THEN GREATEST(0, 1 - i.refund / i.total) ELSE 1 END
    ), 0) AS sales
    FROM daftra_invoice_items it
    JOIN daftra_invoices i ON i.id = it.invoice_id
    WHERE it.product_id = $1
      AND to_char(i.invoice_date, 'YYYY-MM') = $2
  `, [productId, month]);
  return { units: Number(r.rows[0]?.units || 0), sales: r2(Number(r.rows[0]?.sales || 0)) };
}

/** Create or return the frozen budget for a rep in a given month. */
export async function ensureBudget(repId: number, month: string): Promise<RepBudget> {
  const existing = await query<RepBudget>(`SELECT id, rep_id, month, prev_units::float8 as prev_units, sample_budget::float8 as sample_budget,
    promo_budget::float8 as promo_budget, sample_pct::float8 as sample_pct, promo_pct::float8 as promo_pct,
    unit_cost::float8 as unit_cost, prev_sales::float8 as prev_sales
    FROM rep_budgets WHERE rep_id=$1 AND month=$2`, [repId, month]);
  if (existing.rows[0]) return existing.rows[0];

  const rep = (await query<Rep>(`SELECT id, name, product_id, sample_pct::float8 as sample_pct, promo_pct::float8 as promo_pct FROM reps WHERE id=$1`, [repId])).rows[0];
  if (!rep) throw new Error("مندوب غير موجود");

  const globals = (await query<{ sample_pct: number; promo_pct: number }>("SELECT sample_pct::float8 as sample_pct, promo_pct::float8 as promo_pct FROM fin_settings WHERE id=1")).rows[0];
  const sPct = rep.sample_pct ?? globals?.sample_pct ?? 3;
  const pPct = rep.promo_pct ?? globals?.promo_pct ?? 5;

  let prevUnits = 0, prevSales = 0, unitCost = 0;
  if (rep.product_id) {
    const prev = await productUnitsSold(rep.product_id, prevMonth(month));
    prevUnits = prev.units;
    prevSales = prev.sales;
    const prod = (await query<{ average_cost: string }>("SELECT average_cost FROM daftra_products WHERE id=$1", [rep.product_id])).rows[0];
    unitCost = Number(prod?.average_cost || 0);
  }

  const sampleBudget = r3(prevUnits * sPct / 100);
  const promoBudget = r2(prevSales * pPct / 100);

  const ins = await query<RepBudget>(`INSERT INTO rep_budgets(rep_id, month, prev_units, sample_budget, promo_budget, sample_pct, promo_pct, unit_cost, prev_sales)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(rep_id, month) DO UPDATE SET rep_id=rep_budgets.rep_id
    RETURNING id, rep_id, month, prev_units::float8 as prev_units, sample_budget::float8 as sample_budget,
    promo_budget::float8 as promo_budget, sample_pct::float8 as sample_pct, promo_pct::float8 as promo_pct,
    unit_cost::float8 as unit_cost, prev_sales::float8 as prev_sales`,
    [repId, month, prevUnits, sampleBudget, promoBudget, sPct, pPct, unitCost, prevSales]);
  return ins.rows[0];
}

/** Summary for a rep in a month: budget, used, remaining. */
export async function repMonthSummary(repId: number, month: string) {
  const budget = await ensureBudget(repId, month);
  const samplesUsed = (await query<{ total: string }>("SELECT COALESCE(SUM(total_units), 0) as total FROM sample_records WHERE rep_id=$1 AND month=$2", [repId, month])).rows[0];
  const samplesCost = (await query<{ total: string }>("SELECT COALESCE(SUM(total_cost), 0) as total FROM sample_records WHERE rep_id=$1 AND month=$2", [repId, month])).rows[0];
  const promoUsed = (await query<{ total: string }>("SELECT COALESCE(SUM(amount), 0) as total FROM promo_expenses WHERE rep_id=$1 AND month=$2", [repId, month])).rows[0];

  return {
    budget,
    samples: { budget_units: budget.sample_budget, used_units: Number(samplesUsed?.total || 0), used_cost: r2(Number(samplesCost?.total || 0)) },
    promo: { budget_amount: budget.promo_budget, used_amount: r2(Number(promoUsed?.total || 0)) },
  };
}
