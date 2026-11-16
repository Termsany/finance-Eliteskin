/**
 * Supplier offsets («مقاصة الموردين»). A supplier invoices one of our customers directly; per item we are owed
 * (customer price − our price) × qty, and the supplier deducts it from what we owe once it has collected.
 * Each order: printed → collected → settled. The settlement is recorded in Daftra, so the supplier balance mirrored
 * from Daftra already reflects settled orders; what is still owed to us is everything not settled yet, plus any
 * settlement that came in short (until it is closed on purpose). Pure — the API feeds it rows.
 */
export type OffsetStatus = "printed" | "collected" | "settled";
export type OffsetItem = { item: string; product_id: number | null; qty: number; client_price: number; my_price: number };
export type OffsetOrder = {
  id: number; supplier: string; client: string; order_date: string; ref: string; status: OffsetStatus;
  collected_at: string | null; settled_at: string | null; settled_amount: number | null; short_closed: boolean; note: string; items: OffsetItem[];
};
export type OffsetPrice = { id: number; supplier: string; client: string; item: string; product_id: number | null; client_price: number; my_price: number };

export const STATUS_LABEL: Record<OffsetStatus, string> = { printed: "اتطبع", collected: "المورد حصّل", settled: "اتعملت مقاصة" };
/** An order not settled after this many days is flagged. */
export const LATE_DAYS = 30;

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 864e5;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export const lineAmount = (i: Pick<OffsetItem, "qty" | "client_price" | "my_price">) => r2(i.qty * (i.client_price - i.my_price));
export const orderAmount = (o: Pick<OffsetOrder, "items">) => r2(o.items.reduce((s, i) => s + lineAmount(i), 0));

/** What is still owed to us on one order: all of it until settled, then whatever the settlement fell short by (unless closed). */
export function openAmount(o: OffsetOrder) {
  const due = orderAmount(o);
  if (o.status !== "settled") return due;
  if (o.short_closed) return 0;
  return Math.max(0, r2(due - (o.settled_amount ?? due)));
}
export const shortBy = (o: OffsetOrder) => o.status === "settled" && !o.short_closed ? Math.max(0, r2(orderAmount(o) - (o.settled_amount ?? 0))) : 0;

export type OffsetRow = OffsetOrder & { amount: number; open: number; short: number; age: number; late: boolean };
export type SupplierLine = { supplier: string; open: number; printed: number; collected: number; short: number; orders: number; late: number; oldest: number };

/** Every order with its amounts and age, per-supplier totals (most owed first) and overall totals. */
export function summarize(orders: OffsetOrder[], today: string) {
  const rows: OffsetRow[] = orders.map(o => {
    const amount = orderAmount(o), open = openAmount(o), short = shortBy(o), age = Math.max(0, days(o.order_date, today));
    return { ...o, amount, open, short, age, late: o.status !== "settled" && age > LATE_DAYS };
  });
  const by = new Map<string, SupplierLine>();
  for (const r of rows) {
    if (!(r.open > 0)) continue;
    const s = by.get(r.supplier) || { supplier: r.supplier, open: 0, printed: 0, collected: 0, short: 0, orders: 0, late: 0, oldest: 0 };
    s.open += r.open; s.orders++;
    if (r.status === "printed") s.printed += r.open; else if (r.status === "collected") s.collected += r.open; else s.short += r.open;
    if (r.late) s.late++;
    if (r.status !== "settled") s.oldest = Math.max(s.oldest, r.age);
    by.set(r.supplier, s);
  }
  const suppliers = [...by.values()].map(s => ({ ...s, open: r2(s.open), printed: r2(s.printed), collected: r2(s.collected), short: r2(s.short) })).sort((a, b) => b.open - a.open);
  const sum = (f: (s: SupplierLine) => number) => r2(suppliers.reduce((t, s) => t + f(s), 0));
  const month = today.slice(0, 7);
  return {
    rows, suppliers,
    totals: {
      open: sum(s => s.open), printed: sum(s => s.printed), collected: sum(s => s.collected), short: sum(s => s.short),
      late: rows.filter(r => r.late).length, late_amount: r2(rows.filter(r => r.late).reduce((t, r) => t + r.open, 0)),
      settled_month: r2(rows.filter(r => r.status === "settled" && (r.settled_at || "").slice(0, 7) === month).reduce((t, r) => t + (r.settled_amount ?? 0), 0)),
    },
  };
}

/** What is owed to us per supplier (for the supplier pages: Daftra balance − this = what we actually pay). */
export const openBySupplier = (orders: OffsetOrder[]) => {
  const m: Record<string, number> = {};
  for (const o of orders) { const v = openAmount(o); if (v > 0) m[o.supplier] = r2((m[o.supplier] || 0) + v); }
  return m;
};

/** The agreed prices for an item: this customer's first, then the supplier's price for every customer. */
export function priceFor(prices: OffsetPrice[], supplier: string, client: string, item: string) {
  const s = prices.filter(p => p.supplier === supplier && p.item === item);
  return s.find(p => p.client === client) || s.find(p => p.client === "") || null;
}

/**
 * Splits one deduction across several orders, oldest first: each gets its full amount until the money runs out.
 * The last order reached may get a part (and shows as short); orders not reached get 0.
 */
export function allocate(orders: Array<Pick<OffsetRow, "id" | "order_date" | "amount">>, amount: number) {
  let left = r2(amount);
  return [...orders].sort((a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id).map(o => {
    const take = r2(Math.min(o.amount, Math.max(0, left))); left = r2(left - take);
    return { id: o.id, amount: take };
  });
}

const D = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? r2(n) : NaN; };

/** Validates a new / edited order from the form. */
export function cleanOrder(b: Record<string, unknown>): { error: string } | Omit<OffsetOrder, "id" | "status" | "collected_at" | "settled_at" | "settled_amount" | "short_closed"> {
  const supplier = txt(b.supplier, 160), client = txt(b.client, 160), order_date = txt(b.order_date, 10);
  if (!supplier) return { error: "اختار المورد" };
  if (!client) return { error: "اختار العميل" };
  if (!D.test(order_date)) return { error: "اختار تاريخ الطباعة" };
  const raw = Array.isArray(b.items) ? b.items as Array<Record<string, unknown>> : [];
  const items: OffsetItem[] = [];
  for (const it of raw.slice(0, 100)) {
    const item = txt(it.item, 200), qty = Number(it.qty), cp = money(it.client_price), mp = money(it.my_price);
    if (!item && !(qty > 0)) continue;
    if (!item) return { error: "اكتب اسم الصنف" };
    if (!(qty > 0) || qty > 1e7) return { error: `الكمية لازم تكون أكبر من صفر (${item})` };
    if (Number.isNaN(cp) || Number.isNaN(mp)) return { error: `اكتب السعرين (${item})` };
    const pid = Number(it.product_id);
    items.push({ item, product_id: Number.isInteger(pid) && pid > 0 ? pid : null, qty: Math.round(qty * 1000) / 1000, client_price: cp, my_price: mp });
  }
  if (!items.length) return { error: "ضيف صنف واحد على الأقل" };
  return { supplier, client, order_date, ref: txt(b.ref, 60), note: txt(b.note, 300), items };
}

/** A ready WhatsApp message asking the supplier to deduct the open orders. */
export function offsetMessage(supplier: string, rows: OffsetRow[]) {
  const k = (n: number) => Math.round(n).toLocaleString("en-US");
  const open = rows.filter(r => r.supplier === supplier && r.open > 0);
  const total = open.reduce((s, r) => s + r.open, 0);
  const lines = open.slice(0, 12).map(r => `• ${r.order_date}${r.ref ? ` (فاتورة ${r.ref})` : ""} — ${r.client}: ${k(r.open)} ر.س${r.status === "collected" ? " (اتحصّلت من العميل)" : r.status === "settled" ? " (باقي من مقاصة سابقة)" : ""}`);
  return `السلام عليكم ${supplier}،\nبرجاء خصم فرق السعر المتفق عليه من حسابنا، الإجمالي ${k(total)} ر.س:\n${lines.join("\n")}\nشكراً لكم.`;
}
