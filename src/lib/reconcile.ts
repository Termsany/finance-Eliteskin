/**
 * Reconciliation of one customer with Daftra: what the mirror holds for them (invoices, payments by status and by
 * link, documents kept aside such as returns / drafts) and the balance a Daftra-style statement would show.
 * Pure — the API feeds it the rows. Used to find why a customer's balance in the app differs from Daftra's statement.
 */
export type RcInvoice = { id: number; no: string; date: string; total: number; refund: number; unpaid: number; status: number };
export type RcPayment = { id: number; date: string; amount: number; invoice_id: number | null; status: string; method: string };
export type RcOther = { id: number; no: string; date: string | null; type: string; total: number; draft: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + f(x), 0));

export function reconcile(inv: RcInvoice[], pays: RcPayment[], others: RcOther[]) {
  const live = inv.filter(i => i.status !== 3);                    // payment_status 3 = returned in full
  const ids = new Set(inv.map(i => i.id));
  const eff = pays.filter(p => p.status === "1"), skipped = pays.filter(p => p.status !== "1");
  const linked = eff.filter(p => p.invoice_id), unlinked = eff.filter(p => !p.invoice_id);
  const toMissing = linked.filter(p => !ids.has(p.invoice_id!));   // linked to a document the books don't hold
  const invoiced = sum(live, i => i.total), refunds = sum(live, i => i.refund);
  const paidOnInvoices = sum(live, i => Math.max(0, i.total - i.refund - i.unpaid));
  const byStatus: Record<string, { n: number; sum: number }> = {};
  for (const p of skipped) { const o = byStatus[p.status || "?"] || (byStatus[p.status || "?"] = { n: 0, sum: 0 }); o.n++; o.sum = r2(o.sum + p.amount); }
  const byType: Record<string, { n: number; sum: number }> = {};
  for (const d of others) { const k = `${d.type || "?"}${d.draft ? " (مسودة)" : ""}`; const o = byType[k] || (byType[k] = { n: 0, sum: 0 }); o.n++; o.sum = r2(o.sum + d.total); }
  const received = sum(eff, p => p.amount);
  const hints: string[] = [];
  if (skipped.length) hints.push(`${skipped.length} دفعة بإجمالي ${Math.round(sum(skipped, p => p.amount)).toLocaleString("en-US")} ر.س حالتها في دفترة مش «مكتملة» — مش محسوبة.`);
  if (others.length) hints.push(`${others.length} مستند غير الفواتير (مرتجعات/مسودات) بإجمالي ${Math.round(sum(others, d => d.total)).toLocaleString("en-US")} ر.س — مش داخلين في الرصيد.`);
  if (toMissing.length) hints.push(`${toMissing.length} دفعة مربوطة بمستند مش موجود في الفواتير بإجمالي ${Math.round(sum(toMissing, p => p.amount)).toLocaleString("en-US")} ر.س.`);
  return {
    invoices: { n: live.length, invoiced, refunds, paid_on_invoices: paidOnInvoices, unpaid: sum(live, i => i.unpaid) },
    payments: { n: eff.length, received, linked: { n: linked.length, sum: sum(linked, p => p.amount) }, unlinked: { n: unlinked.length, sum: sum(unlinked, p => p.amount) },
      to_missing: { n: toMissing.length, sum: sum(toMissing, p => p.amount) }, skipped: byStatus },
    others: byType,
    // what a Daftra statement shows from these rows: invoices − returns on them − payments received
    balance: r2(invoiced - refunds - received),
    unapplied: r2(Math.max(0, received - paidOnInvoices)),
    hints,
  };
}
export type Reconcile = ReturnType<typeof reconcile>;
