/**
 * Expenses kept in this app (not in Daftra) — the three kinds of the first version:
 *  fixed: every month from `start` until `stop` (exclusive) or forever
 *  temp:  every month from `start` to `end` (inclusive)
 *  once:  one payment on `date`
 * They feed the P&L as operating expenses, and fixed/temp ones are the monthly fixed costs for planning and cash.
 */
export type AppExpense = { id: number; name: string; cat: string; amount: number; type: "fixed" | "temp" | "once"; start: string | null; end: string | null; stop: string | null; date: string | null; note: string };
export const CATS = ["إيجار", "مرتبات", "تسويق", "مرافق", "أقساط", "صيانة", "اشتراكات", "أخرى"] as const;
export const TYPE_LABEL: Record<AppExpense["type"], string> = { fixed: "ثابت كل شهر", temp: "مؤقت لمدة", once: "مرة واحدة" };

const nextMonth = (m: string) => { let [y, mo] = m.split("-").map(Number); mo++; if (mo > 12) { mo = 1; y++; } return `${y}-${String(mo).padStart(2, "0")}`; };

/** Is the expense due in month `m` (YYYY-MM)? */
export function activeIn(e: AppExpense, m: string) {
  if (e.type === "fixed") return !!e.start && e.start <= m && (!e.stop || m < e.stop);
  if (e.type === "temp") return !!e.start && !!e.end && e.start <= m && m <= e.end;
  return (e.date || "").slice(0, 7) === m;
}

/** Synthetic account per category, coded 5·… so the P&L counts it as an operating expense. Ids are negative to never clash with Daftra. */
export const catAccount = (cat: string) => { const i = (CATS as readonly string[]).indexOf(cat); const n = i < 0 ? CATS.length : i; return { id: -(n + 1), code: `5·${n + 1}`, name: `مصروفات البرنامج: ${cat}` }; };

/** One entry per due month (on the 1st) up to `today`'s month, and once-expenses on their date up to today. */
export function toEntries(list: AppExpense[], today: string) {
  const out: Array<{ id: number; kind: "expense"; date: string; amount: number; tax: number; account_id: number; vendor: string; note: string }> = [];
  const cur = today.slice(0, 7);
  for (const e of list) {
    const acc = catAccount(e.cat);
    if (e.type === "once") { if (e.date && e.date <= today) out.push({ id: -(e.id * 1000), kind: "expense", date: e.date, amount: e.amount, tax: 0, account_id: acc.id, vendor: "", note: e.name }); continue; }
    if (!e.start) continue;
    let k = 0;
    for (let m = e.start; m <= cur && k < 240; m = nextMonth(m), k++) if (activeIn(e, m)) out.push({ id: -(e.id * 1000 + k + 1), kind: "expense", date: `${m}-01`, amount: e.amount, tax: 0, account_id: acc.id, vendor: "", note: e.name });
  }
  return out;
}

/** Monthly fixed costs in the shape the finance engine plans with. */
export function toFixed(list: AppExpense[]) {
  return list.filter(e => e.type !== "once" && e.start).map(e => ({ id: String(e.id), name: e.name, category: e.cat, monthly_amount: e.amount,
    start_month: `${e.start}-01`, end_month: e.type === "temp" ? `${e.end}-01` : e.stop ? `${prevMonth(e.stop)}-01` : null, notes: e.note,
    type: e.type as "fixed" | "temp" }));
}
const prevMonth = (m: string) => { let [y, mo] = m.split("-").map(Number); mo--; if (mo < 1) { mo = 12; y--; } return `${y}-${String(mo).padStart(2, "0")}`; };

/** Validates a new expense from the form; returns an error message or the clean row. */
export function cleanExpense(b: Record<string, unknown>): { error: string } | Omit<AppExpense, "id"> {
  const name = String(b.name || "").trim().slice(0, 120), amount = Number(b.amount);
  const cat = (CATS as readonly string[]).includes(String(b.cat)) ? String(b.cat) : "أخرى";
  const type = ["fixed", "temp", "once"].includes(String(b.type)) ? b.type as AppExpense["type"] : "once";
  if (!name) return { error: "اسم البند مطلوب" };
  if (!(amount > 0) || amount > 1e9) return { error: "المبلغ لازم يكون أكبر من صفر" };
  const M = /^20\d\d-(0[1-9]|1[0-2])$/, D = /^20\d\d-\d\d-\d\d$/;
  const row = { name, cat, amount: Math.round(amount * 100) / 100, type, start: null as string | null, end: null as string | null, stop: null as string | null, date: null as string | null, note: String(b.note || "").trim().slice(0, 300) };
  if (type === "once") { if (!D.test(String(b.date || ""))) return { error: "اختار التاريخ" }; row.date = String(b.date); }
  else {
    if (!M.test(String(b.start || ""))) return { error: "اختار شهر البداية" }; row.start = String(b.start);
    if (type === "temp") { if (!M.test(String(b.end || "")) || String(b.end) < row.start) return { error: "آخر شهر لازم يكون بعد شهر البداية" }; row.end = String(b.end); }
  }
  return row;
}
