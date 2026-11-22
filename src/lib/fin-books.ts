import { r2, addDays, daysBetween as days } from "@/lib/fmt";
/** Pure helpers for the accounts page: party statements and the attention list. No I/O. */

export type StDoc = { id: number; no: string; date: string; due_days: number; status: number; total: number; paid: number; unpaid: number; refund: number };
export type StPay = { id: number; date: string; amount: number; invoice_id: number | null; method: string };
export type StLine = { date: string; kind: "invoice" | "refund" | "payment" | "offset"; ref: string; doc_id: number | null; debit: number; credit: number; balance: number; note: string };


/**
 * Running statement. Customer: invoice = debit (they owe you), payment / refund = credit.
 * Supplier: purchase = credit (you owe them); Daftra supplier payments aren't mirrored, so the paid part of each
 * purchase is shown as one debit line on the purchase date. The closing balance always equals the open amounts.
 */
export function statement(kind: "client" | "supplier", docs: StDoc[], pays: StPay[], today: string) {
  const lines: Omit<StLine, "balance">[] = [];
  const fullyReturned = (d: StDoc) => d.status === 3;
  const returnedIds = new Set(docs.filter(fullyReturned).map(d => d.id));
  for (const d of docs) {
    if (fullyReturned(d)) continue;
    if (kind === "client") {
      lines.push({ date: d.date, kind: "invoice", ref: d.no, doc_id: d.id, debit: d.total, credit: 0, note: `فاتورة ${d.no}` });
      if (d.refund > 0) lines.push({ date: d.date, kind: "refund", ref: d.no, doc_id: d.id, debit: 0, credit: d.refund, note: `مرتجع على ${d.no}` });
    } else {
      lines.push({ date: d.date, kind: "invoice", ref: d.no, doc_id: d.id, debit: 0, credit: d.total, note: `فاتورة شراء ${d.no}` });
      if (d.refund > 0) lines.push({ date: d.date, kind: "refund", ref: d.no, doc_id: d.id, debit: d.refund, credit: 0, note: `مرتجع على ${d.no}` });
      // If we have real payment records from Daftra, skip the synthetic "paid from invoice" line —
      // the real payments below will carry the correct dates. Otherwise fall back to the invoice's paid field.
      if (pays.length === 0) {
        const paid = r2(d.total - d.refund - d.unpaid);
        if (paid > 0) lines.push({ date: d.date, kind: "payment", ref: d.no, doc_id: d.id, debit: paid, credit: 0, note: `المدفوع من ${d.no}` });
      }
    }
  }
  const isRet = (p: StPay) => p.method === "return";
  const isOff = (p: StPay) => p.method === "offset";
  // Skip payments linked to fully-returned invoices (the invoice itself is excluded above)
  if (kind === "client") for (const p of pays) {
    if (p.invoice_id && returnedIds.has(p.invoice_id)) continue;
    lines.push({ date: p.date, kind: isRet(p) ? "refund" : "payment", ref: String(p.id), doc_id: p.invoice_id, debit: 0, credit: p.amount,
      note: isRet(p) ? "مرتجعات مش مربوطة بفاتورة" : p.method ? `دفعة (${p.method})` : "دفعة" });
  }
  if (kind === "supplier") for (const p of pays) {
    if (p.invoice_id && returnedIds.has(p.invoice_id)) continue;
    if (isOff(p)) {
      // Offsets are informational: show the line but don't affect the running balance.
      // The actual deduction comes from Daftra's credit note / payment when the supplier settles.
      lines.push({ date: p.date, kind: "offset", ref: String(p.id), doc_id: null, debit: 0, credit: 0,
        note: `مقاصة #${p.id} — ${r2(p.amount)} ر.س (للعلم فقط، لا تؤثر على الرصيد)` });
    } else {
      lines.push({ date: p.date, kind: isRet(p) ? "refund" : "payment", ref: String(p.id), doc_id: p.invoice_id, debit: p.amount, credit: 0,
        note: isRet(p) ? "مرتجعات مش مربوطة بفاتورة شراء" : p.method ? `دفعة (${p.method})` : "دفعة" });
    }
  }
  const order = { invoice: 0, refund: 1, offset: 2, payment: 3 } as const;
  lines.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
  let bal = 0;
  const sign = kind === "client" ? 1 : -1; // positive = they owe you (client) / you owe them (supplier)
  const out: StLine[] = lines.map(l => { bal += sign * (l.debit - l.credit); return { ...l, debit: r2(l.debit), credit: r2(l.credit), balance: r2(bal) }; });
  // a customer's payments Daftra didn't apply to an invoice still owe nothing — net them off the open invoices, oldest first
  const allocPaid = docs.filter(d => !fullyReturned(d)).reduce((s, d) => s + Math.max(0, d.total - d.refund - d.unpaid), 0);
  const totalPaid = pays.reduce((s, p) => s + p.amount, 0);
  let credit = kind === "client" ? Math.max(0, r2(totalPaid - allocPaid)) : 0;
  const credit0 = credit;
  const open = docs.filter(d => !fullyReturned(d) && d.unpaid > 0 && (d.status === 0 || d.status === 1))
    .map(d => ({ id: d.id, no: d.no, date: d.date, due: addDays(d.date, d.due_days || 0), unpaid: d.unpaid }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.due.localeCompare(b.due))   // oldest invoice date first for FIFO
    .map(o => { let u = o.unpaid; if (credit > 0) { const used = Math.min(credit, u); u = r2(u - used); credit = r2(credit - used); } return { ...o, unpaid: r2(u), days_late: Math.max(0, days(o.due, today)) }; })
    .filter(o => o.unpaid > 0)
    .sort((a, b) => b.days_late - a.days_late);
  const openTotal = r2(open.reduce((s, o) => s + o.unpaid, 0));
  return {
    lines: out,
    totals: { invoiced: r2(docs.filter(d => !fullyReturned(d)).reduce((s, d) => s + d.total, 0)), refunds: r2(docs.filter(d => !fullyReturned(d)).reduce((s, d) => s + d.refund, 0) + pays.filter(p => isRet(p) && !(p.invoice_id && returnedIds.has(p.invoice_id))).reduce((s, p) => s + p.amount, 0)),
      paid: r2(kind === "client" ? pays.filter(p => !isRet(p) && !(p.invoice_id && returnedIds.has(p.invoice_id))).reduce((s, p) => s + p.amount, 0)
        : pays.length > 0 ? pays.filter(p => !isRet(p) && !isOff(p) && !(p.invoice_id && returnedIds.has(p.invoice_id))).reduce((s, p) => s + p.amount, 0)
        : docs.filter(d => !fullyReturned(d)).reduce((s, d) => s + Math.max(0, d.total - d.refund - d.unpaid), 0)),
      offsets: r2(pays.filter(p => isOff(p)).reduce((s, p) => s + p.amount, 0)),
      balance: r2(bal), open: openTotal, overdue: r2(open.filter(o => o.days_late > 0).reduce((s, o) => s + o.unpaid, 0)),
      // customer credit already netted off the open invoices above; what's left is an advance beyond every open invoice
      credit_applied: r2(credit0 - credit), unallocated: r2(bal - openTotal) },
    open,
    last_invoice: docs.length ? docs[docs.length - 1].date : null,
    last_payment: pays.filter(p => !isRet(p) && !isOff(p)).at(-1)?.date ?? null,
  };
}

export type Attention = { level: "danger" | "warn" | "info"; title: string; text: string; tab: string; party?: string; kind?: "client" | "supplier" };
type Book = { parties: Array<{ name: string; unpaid: number; overdue: number; oldestDue: number }>; open: Array<{ party: string; unpaid: number; due: string; days: number }> };
type Mon = { m: string; opex: number; sales: number; cogs: number };

/** What the owner should look at today, most urgent first (at most `max`). */
export function attention(x: { ar: Book; ap: Book; monthly: Mon[]; price_guard: { below_cost: number; real_loss: number }; stock_alerts: Array<{ name: string; stock_status: string }>; cost_coverage: number; today: string }, max = 8): Attention[] {
  const out: Attention[] = [];
  const k = (n: number) => Math.round(n).toLocaleString("en-US");
  for (const p of x.ar.parties.filter(p => p.oldestDue > 60 && p.overdue > 0).slice(0, 3))
    out.push({ level: p.oldestDue > 90 ? "danger" : "warn", title: `${p.name}: ${k(p.overdue)} ر.س متأخر`, text: `أقدم فاتورة متأخرة ${p.oldestDue} يوم.`, tab: "clients", party: p.name, kind: "client" });
  const week = addDays(x.today, 7);
  const dueAp = x.ap.open.filter(o => o.due <= week);
  if (dueAp.length) {
    const by = new Map<string, number>(); for (const o of dueAp) by.set(o.party, (by.get(o.party) || 0) + o.unpaid);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
    out.push({ level: dueAp.some(o => o.days > 0) ? "danger" : "warn", title: `${k(dueAp.reduce((s, o) => s + o.unpaid, 0))} ر.س للموردين مستحقة لحد ${week}`, text: top.slice(0, 3).map(([n, v]) => `${n} ${k(v)}`).join("، "), tab: "suppliers", party: top[0][0], kind: "supplier" });
  }
  if (x.price_guard.below_cost > 0) out.push({ level: "danger", title: `${x.price_guard.below_cost} سطر اتباع تحت التكلفة`, text: `خسارة فعلية ${k(x.price_guard.real_loss)} ر.س في الفترة.`, tab: "products" });
  const done = x.monthly.filter(m => m.m < x.today.slice(0, 7));
  if (done.length >= 2) {
    const last = done[done.length - 1], prev = done.slice(0, -1), avg = prev.reduce((s, m) => s + m.opex, 0) / prev.length;
    if (avg > 0 && last.opex > avg * 1.3 && last.opex - avg > 1000) out.push({ level: "warn", title: `مصروفات ${last.m} أعلى من المتوسط بـ ${Math.round((last.opex / avg - 1) * 100)}%`, text: `${k(last.opex)} مقابل متوسط ${k(avg)} ر.س.`, tab: "expenses" });
  }
  const out0 = x.stock_alerts.filter(s => s.stock_status === "out" || s.stock_status === "negative");
  if (out0.length) out.push({ level: "warn", title: `${out0.length} صنف خلص من المخزون`, text: out0.slice(0, 4).map(s => s.name).join("، "), tab: "products" });
  if (x.cost_coverage < 90) out.push({ level: "info", title: `تكلفة ${Math.round(x.cost_coverage)}% بس من المبيعات معروفة`, text: "الربح ممكن يكون أعلى من الحقيقي: أصناف اتباعت من غير فاتورة شراء ليها في دفترة.", tab: "products" });
  if (done.length >= 3) {
    const last3 = done.slice(-3);
    if (last3.every((m, i) => i === 0 || m.sales < last3[i - 1].sales) && last3[0].sales > 0)
      out.push({ level: "warn", title: "المبيعات بتنزل ٣ شهور ورا بعض", text: last3.map(m => `${m.m}: ${k(m.sales)}`).join(" ← "), tab: "pnl" });
    const margins = last3.filter(m => m.sales > 0).map(m => (m.sales - m.cogs) / m.sales * 100);
    if (margins.length >= 2 && margins[margins.length - 1] < margins[0] - 5)
      out.push({ level: "warn", title: `هامش الربح نزل من ${Math.round(margins[0])}% لـ ${Math.round(margins[margins.length - 1])}%`, text: "الفرق أكتر من ٥ نقط في آخر ٣ شهور — شيك الأسعار والتكاليف.", tab: "pnl" });
  }
  const topAr = x.ar.parties.filter(p => p.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid);
  const arTotal = topAr.reduce((s, p) => s + p.unpaid, 0);
  if (topAr.length > 0 && arTotal > 0 && topAr[0].unpaid / arTotal > 0.4)
    out.push({ level: "info", title: `${Math.round(topAr[0].unpaid / arTotal * 100)}% من المديونيات عند عميل واحد`, text: `${topAr[0].name}: ${k(topAr[0].unpaid)} ر.س — مخاطرة تركّز عالية.`, tab: "clients", party: topAr[0].name, kind: "client" });
  const rank = { danger: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, max);
}
