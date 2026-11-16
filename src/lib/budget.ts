/**
 * The monthly budget picture: where this month's sales and net profit stand against the owner's targets
 * (adjusted for how far into the month we are), and the break-even sales — how much has to be sold to cover costs.
 * Pure: the API feeds it the current month's figures.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Target = {
  target: number | null; actual: number;
  expected_by_now: number | null;   // where you'd be if evenly paced
  pct: number | null;                // actual / target
  pace: number | null;               // actual / expected_by_now (>1 = ahead of pace)
  projected: number | null;          // month-end projection at the current run-rate
  on_track: boolean | null;
};

/** `today` is YYYY-MM-DD; day/days drive the pace. */
export function monthProgress(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { day: d, days, frac: d / days };
}

function track(actual: number, target: number | null, frac: number): Target {
  if (target === null || !(target > 0)) return { target, actual: r2(actual), expected_by_now: null, pct: null, pace: null, projected: null, on_track: null };
  const expected = target * frac, projected = frac > 0 ? actual / frac : actual;
  return {
    target: r2(target), actual: r2(actual), expected_by_now: r2(expected), pct: r2(actual / target * 100),
    pace: expected > 0 ? r2(actual / expected * 100) : null, projected: r2(projected),
    on_track: actual >= expected,
  };
}

export function computeBudget(x: {
  today: string; monthSales: number; monthNet: number;
  grossMarginPct: number | null; fixedMonthly: number; monthOpex: number;
  salesTarget: number | null; profitTarget: number | null;
}) {
  const p = monthProgress(x.today);
  // break-even sales = monthly fixed/operating cost ÷ gross-margin ratio
  const gm = x.grossMarginPct && x.grossMarginPct > 0 ? x.grossMarginPct / 100 : null;
  const fixed = x.fixedMonthly > 0 ? x.fixedMonthly : x.monthOpex;
  const breakeven = gm ? r2(fixed / gm) : null;
  return {
    ...p,
    sales: track(x.monthSales, x.salesTarget, p.frac),
    profit: track(x.monthNet, x.profitTarget, p.frac),
    breakeven: {
      sales: breakeven, fixed: r2(fixed), gross_margin: x.grossMarginPct,
      covered_pct: breakeven ? r2(x.monthSales / breakeven * 100) : null,
      remaining: breakeven ? r2(Math.max(0, breakeven - x.monthSales)) : null,
      reached: breakeven !== null && x.monthSales >= breakeven,
    },
  };
}
export type Budget = ReturnType<typeof computeBudget>;
