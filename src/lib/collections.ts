/**
 * What has to be collected from customers (or paid to suppliers) in a month: everything already overdue
 * plus everything falling due before the month ends. Pure — the API feeds it the open documents.
 */
export type OpenDoc = { id: number; no: string; date: string; party: string; unpaid: number; due: string };
export type Status = "overdue" | "week" | "month";
export type Row = OpenDoc & { status: Status; days: number };
export type Group = { party: string; total: number; overdue: number; due: number; oldest: number; next_due: string | null; rows: Row[] };

const DAY = 864e5;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
export const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };

/**
 * `month` is YYYY-MM. Overdue = due before today (always included, whatever the month).
 * Due = from max(today, month start) to the month's last day; "week" = within the next 7 days.
 * A past month shows only what is still overdue.
 */
export function collectionPlan(docs: OpenDoc[], month: string, today: string) {
  const start = `${month}-01`, end = monthEnd(month), from = start > today ? start : today, week = iso(t(today) + 6 * DAY);
  const rows: Row[] = [];
  for (const d of docs) {
    if (!(d.unpaid > 0)) continue;
    const days = Math.round((t(today) - t(d.due)) / DAY); // > 0 late, <= 0 days left
    if (d.due < today) rows.push({ ...d, status: "overdue", days });
    else if (d.due >= from && d.due <= end) rows.push({ ...d, status: d.due <= week ? "week" : "month", days });
  }
  rows.sort((a, b) => a.due.localeCompare(b.due) || b.unpaid - a.unpaid);
  const sum = (s?: Status) => r2(rows.filter(r => !s || r.status === s).reduce((a, r) => a + r.unpaid, 0));
  const by = new Map<string, Group>();
  for (const r of rows) {
    const g = by.get(r.party) || { party: r.party, total: 0, overdue: 0, due: 0, oldest: 0, next_due: null, rows: [] };
    g.total += r.unpaid; g.rows.push(r);
    if (r.status === "overdue") { g.overdue += r.unpaid; g.oldest = Math.max(g.oldest, r.days); }
    else { g.due += r.unpaid; if (!g.next_due || r.due < g.next_due) g.next_due = r.due; }
    by.set(r.party, g);
  }
  // most urgent first: overdue money, then the oldest, then the biggest
  const groups = [...by.values()].map(g => ({ ...g, total: r2(g.total), overdue: r2(g.overdue), due: r2(g.due) }))
    .sort((a, b) => (b.overdue > 0 ? 1 : 0) - (a.overdue > 0 ? 1 : 0) || b.oldest - a.oldest || b.total - a.total);
  return {
    month, today, from, end, week_end: week,
    totals: { required: sum(), overdue: sum("overdue"), week: sum("week"), month: sum("month"), due: r2(sum("week") + sum("month")),
      parties: groups.length, overdue_parties: groups.filter(g => g.overdue > 0).length, invoices: rows.length },
    rows, groups,
  };
}

/** Money received in [from, to] (customer payments). */
export const receivedIn = (payments: Array<{ date: string; amount: number }>, from: string, to: string) =>
  r2(payments.filter(p => p.date >= from && p.date <= to).reduce((s, p) => s + p.amount, 0));

/** A ready WhatsApp reminder for one customer's open invoices. */
export function reminderText(g: Pick<Group, "party" | "total" | "overdue" | "rows">) {
  const k = (n: number) => Math.round(n).toLocaleString("en-US");
  const lines = g.rows.slice(0, 8).map(r => `• فاتورة ${r.no} بتاريخ ${r.date}: ${k(r.unpaid)} ر.س${r.status === "overdue" ? ` (متأخرة ${r.days} يوم)` : ` (تستحق ${r.due})`}`);
  return `السلام عليكم ${g.party}،\nنحب نفكّركم بالمستحق لنا عندكم ${k(g.total)} ر.س${g.overdue ? `، منه ${k(g.overdue)} ر.س فات ميعاده` : ""}:\n${lines.join("\n")}\nياريت تأكدوا لنا ميعاد السداد. شكراً لكم.`;
}

/* ───────── month by month ───────── */
export type Bucket = { key: string; label: string; amount: number; invoices: number; parties: number };
export type PartyLine = { party: string; total: number; overdue: number; selected: number; after: number; oldest: number; next_due: string | null; rows: Row[] };

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const addMonths = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/** Which bucket an open document belongs to: "overdue" (due before today), a month "YYYY-MM", or "later". */
export function bucketOf(due: string, today: string, horizon: string) {
  if (due < today) return "overdue";
  const m = due.slice(0, 7);
  return m <= horizon ? m : "later";
}

/**
 * The open documents split into: overdue, this month and the next `ahead` months (each month only
 * what falls due in it), and everything later. `sel` picks one bucket; every party with money in it gets
 * its full open balance, the overdue part, the part in the selected bucket and what comes after it.
 */
export function monthlyPlan(docs: OpenDoc[], today: string, sel: string, ahead = 5) {
  const cur = today.slice(0, 7), horizon = addMonths(cur, ahead);
  const keys = ["overdue", ...Array.from({ length: ahead + 1 }, (_, i) => addMonths(cur, i)), "later"];
  const rows: Row[] = docs.filter(d => d.unpaid > 0).map(d => {
    const days = Math.round((t(today) - t(d.due)) / DAY);
    const status: Status = d.due < today ? "overdue" : days > -7 ? "week" : "month";
    return { ...d, status, days };
  }).sort((a, b) => a.due.localeCompare(b.due) || b.unpaid - a.unpaid);
  const keyOf = (r: Row) => bucketOf(r.due, today, horizon);
  const buckets: Bucket[] = keys.map(k => { const rs = rows.filter(r => keyOf(r) === k);
    return { key: k, label: k === "overdue" ? "متأخر" : k === "later" ? "بعد كده" : monthLabel(k), amount: r2(rs.reduce((s, r) => s + r.unpaid, 0)), invoices: rs.length, parties: new Set(rs.map(r => r.party)).size }; });
  const selKey = keys.includes(sel) ? sel : cur;
  // "after" = due later than the selected bucket (for "overdue": everything not yet due)
  const isAfter = (r: Row) => selKey === "overdue" ? r.due >= today : selKey === "later" ? false : keyOf(r) !== "overdue" && (keyOf(r) === "later" || keyOf(r) > selKey);
  const by = new Map<string, PartyLine>();
  for (const r of rows) {
    const p = by.get(r.party) || { party: r.party, total: 0, overdue: 0, selected: 0, after: 0, oldest: 0, next_due: null, rows: [] };
    p.total += r.unpaid; p.rows.push(r);
    if (r.status === "overdue") { p.overdue += r.unpaid; p.oldest = Math.max(p.oldest, r.days); } else if (!p.next_due || r.due < p.next_due) p.next_due = r.due;
    if (keyOf(r) === selKey) p.selected += r.unpaid; else if (isAfter(r)) p.after += r.unpaid;
    by.set(r.party, p);
  }
  const parties = [...by.values()].map(p => ({ ...p, total: r2(p.total), overdue: r2(p.overdue), selected: r2(p.selected), after: r2(p.after) }))
    .sort((a, b) => b.selected - a.selected || b.total - a.total);
  const sum = (f: (p: PartyLine) => number, list = parties) => r2(list.reduce((s, p) => s + f(p), 0));
  const inSel = parties.filter(p => p.selected > 0);
  return {
    today, current: cur, sel: selKey, label: buckets.find(b => b.key === selKey)!.label, buckets, parties,
    totals: { open: sum(p => p.total), overdue: sum(p => p.overdue), selected: sum(p => p.selected), parties_selected: inSel.length,
      // what has to come in by the end of the selected month: overdue + every month up to it
      by_end: selKey === "overdue" ? sum(p => p.overdue) : selKey === "later" ? sum(p => p.total) : r2(buckets.filter(b => b.key === "overdue" || (b.key !== "later" && b.key <= selKey)).reduce((s, b) => s + b.amount, 0)) },
  };
}
