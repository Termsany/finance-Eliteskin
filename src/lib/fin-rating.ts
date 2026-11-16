/**
 * How a customer pays: the average days between an invoice and its payment, from the mirrored invoices and
 * client payments. Payments aren't always linked to an invoice in Daftra, so when a payment has no invoice_id
 * it is matched to the oldest still-unpaid invoice (FIFO), the way a statement is settled. Pure.
 */
export type RateDoc = { id: number; date: string; total: number };
export type RatePay = { date: string; amount: number; invoice_id: number | null };

const DAY = 864e5;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export type Rating = { avg_days: number | null; paid_invoices: number; label: "ممتاز" | "جيد" | "متأخر" | "متعثر" | "جديد"; suggested_credit: number | null };

/** Weighted average days-to-pay (by amount), a label, and a suggested credit limit (~the biggest single invoice). */
export function rateCustomer(docs: RateDoc[], pays: RatePay[]): Rating {
  const byId = new Map(docs.map(d => [d.id, d]));
  const sorted = [...docs].sort((a, b) => a.date.localeCompare(b.date));
  // allocate each payment to an invoice date: linked one, else oldest open first
  const open = sorted.map(d => ({ date: d.date, left: d.total }));
  let wDays = 0, wAmt = 0, paidInvoices = 0;
  const settle = (invDate: string, payDate: string, amount: number) => { const d = days(invDate, payDate); if (d >= 0) { wDays += d * amount; wAmt += amount; } };
  for (const p of [...pays].sort((a, b) => a.date.localeCompare(b.date))) {
    let amt = p.amount;
    if (p.invoice_id && byId.has(p.invoice_id)) { settle(byId.get(p.invoice_id)!.date, p.date, amt); paidInvoices++; continue; }
    for (const o of open) { if (amt <= 0) break; if (o.left <= 0) continue; const take = Math.min(o.left, amt); settle(o.date, p.date, take); o.left -= take; amt -= take; if (o.left <= 0.01) paidInvoices++; }
  }
  if (wAmt <= 0) return { avg_days: null, paid_invoices: 0, label: "جديد", suggested_credit: null };
  const avg = Math.round(wDays / wAmt);
  const label = avg <= 15 ? "ممتاز" : avg <= 40 ? "جيد" : avg <= 70 ? "متأخر" : "متعثر";
  const biggest = Math.max(0, ...docs.map(d => d.total));
  return { avg_days: avg, paid_invoices: paidInvoices, label, suggested_credit: biggest > 0 ? Math.round(biggest * (avg <= 40 ? 1.5 : 1) / 1000) * 1000 : null };
}
