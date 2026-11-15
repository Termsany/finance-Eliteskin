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
