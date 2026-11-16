"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { STATUS_LABEL, lineAmount, orderAmount, priceFor, offsetMessage,
  type OffsetItem, type OffsetOrder, type OffsetPrice, type OffsetRow, type OffsetStatus, type SupplierLine } from "@/lib/offsets";
import { sar } from "./kit";
import { Tile } from "./summary";

type Data = { today: string; rows: OffsetRow[]; suppliers: SupplierLine[]; prices: OffsetPrice[];
  suppliers_list: string[]; clients_list: string[]; products: Array<{ id: number; name: string }>;
  totals: { open: number; printed: number; collected: number; short: number; late: number; late_amount: number; settled_month: number } };

const ST: Record<OffsetStatus, string> = { printed: "bg-slate-100 text-slate-700", collected: "bg-amber-50 text-amber-800", settled: "bg-emerald-50 text-emerald-700" };
const k = (n: number) => Math.round(n).toLocaleString("en-US");

/** «مقاصة الموردين»: every order from printed → collected → settled, and what each supplier still owes us in price differences. */
export function Offsets({ open }: { open: (kind: "supplier", name: string) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"orders" | "prices">("orders");
  const [sup, setSup] = useState<string>("");              // supplier filter
  const [stat, setStat] = useState<OffsetStatus | "open" | "all">("open");
  const [form, setForm] = useState<OffsetOrder | "new" | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const j = await fetch("/api/admin/finance/offsets", { cache: "no-store" }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (j?.totals) setD(j); else toast(j?.error || "تعذر تحميل المقاصة", "error");
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    let l = d?.rows || [];
    if (sup) l = l.filter(r => r.supplier === sup);
    if (stat === "open") l = l.filter(r => r.open > 0);
    else if (stat !== "all") l = l.filter(r => r.status === stat);
    return [...l].sort((a, b) => b.late ? 1 : a.late ? -1 : b.open - a.open || b.order_date.localeCompare(a.order_date));
  }, [d, sup, stat]);

  async function move(id: number, body: Record<string, unknown>, ok: string) {
    const r = await fetch("/api/admin/finance/offsets/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return false; }
    toast(ok, "success"); await load(); return true;
  }
  async function del(id: number) {
    if (!confirm("تمسح الأوردر ده؟")) return;
    const r = await fetch(`/api/admin/finance/offsets/orders?id=${id}`, { method: "DELETE" });
    if (r.ok) { toast("اتمسح", "success"); await load(); } else toast("تعذر المسح", "error");
  }

  if (!d) return <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card)]" />;

  return <div className={`space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
        <button type="button" onClick={() => setTab("orders")} className={seg(tab === "orders")}>الأوردرات والمتابعة</button>
        <button type="button" onClick={() => setTab("prices")} className={seg(tab === "prices")}>الأسعار المتفق عليها</button>
      </div>
      <span className="mr-auto flex items-center gap-2">
        {tab === "orders" && <a href="/report/offsets" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs font-bold text-[var(--navy)]"><Icon name="file" size={14} />تقرير PDF</a>}
        <button type="button" onClick={() => setForm("new")} className="flex items-center gap-1.5 rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white"><Icon name="pen" size={14} />أوردر جديد</button>
      </span>
    </div>

    {tab === "prices" ? <Prices d={d} reload={load} toast={toast} />
      : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="مطلوب لنا من الموردين" value={sar(d.totals.open)} sub="فروق أسعار لسه ما اتخصمتش" tone={d.totals.open > 0 ? undefined : undefined} />
          <Tile label="لسه ما حصّلوش من العميل" value={sar(d.totals.printed)} sub="أوردرات اتطبعت بس" />
          <Tile label="حصّلوا — في انتظار المقاصة" value={sar(d.totals.collected)} tone={d.totals.collected > 0 ? "warn" : undefined} sub="المورد قبض وينفع نطالبه" />
          <Tile label="اتخصم الشهر ده" value={sar(d.totals.settled_month)} tone="good" sub={d.totals.short > 0 ? <span className="text-red-700">فيه {sar(d.totals.short)} خصم ناقص</span> : "مقاصات تمت"} />
        </div>

        {d.totals.late > 0 && <div className="rounded-2xl bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900 ring-1 ring-amber-200">
          ⏰ {d.totals.late} أوردر عدّى عليه أكتر من 30 يوم من غير مقاصة بإجمالي {sar(d.totals.late_amount)} — طالب الموردين بيها.</div>}

        {/* per-supplier chips */}
        {d.suppliers.length > 0 && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSup("")} className={chip(!sup)}>الكل ({d.suppliers.length})</button>
          {d.suppliers.map(s => <button key={s.supplier} type="button" onClick={() => setSup(s.supplier === sup ? "" : s.supplier)} className={chip(sup === s.supplier)}>
            {s.supplier} · <b>{k(s.open)}</b>{s.late > 0 && <span className="text-red-600"> ⏰{s.late}</span>}</button>)}
        </div>}

        <div className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
            <b className="text-[15px]">{sup || "كل الموردين"}</b>
            <span className="mr-auto flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
              {([["open", "المفتوح"], ["printed", "اتطبع"], ["collected", "حصّل"], ["settled", "اتعمل مقاصة"], ["all", "الكل"]] as const).map(([v, l]) =>
                <button key={v} type="button" onClick={() => setStat(v)} className={seg(stat === v)}>{l}</button>)}
            </span>
          </div>
          {!rows.length ? <div className="p-8 text-center text-sm text-[var(--muted)]">مفيش أوردرات هنا</div>
            : <div className="divide-y divide-[var(--border)]">{rows.map(r => <OrderRow key={r.id} r={r} today={d.today}
              on={openRow === r.id} toggle={() => setOpenRow(openRow === r.id ? null : r.id)}
              move={move} del={del} edit={() => setForm(r as unknown as OffsetOrder)} openSup={() => open("supplier", r.supplier)}
              msg={() => { navigator.clipboard?.writeText(offsetMessage(r.supplier, d.rows)).then(() => toast("اتنسخت رسالة واتساب", "success")).catch(() => toast("تعذر النسخ", "error")); }} />)}</div>}
        </div>
        <div className="text-[11px] text-[var(--muted)]">المقاصة بتتسجل في دفترة، فرصيد المورد في «الموردين» بيكون اتخصم منه الفرق لوحده. البرنامج هنا بيتابع الأوردرات لحد ما المقاصة تتم بس.</div>
      </>}

    {form && <OrderForm order={form} d={d} onClose={() => setForm(null)} reload={load} toast={toast} />}
  </div>;
}

const seg = (on: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold transition ${on ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`;
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-[var(--navy)] bg-[var(--sky-light)] text-[var(--navy)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--sky-border)]"}`;

function OrderRow({ r, today, on, toggle, move, del, edit, openSup, msg }: {
  r: OffsetRow; today: string; on: boolean; toggle: () => void;
  move: (id: number, body: Record<string, unknown>, ok: string) => Promise<boolean>; del: (id: number) => void; edit: () => void; openSup: () => void; msg: () => void }) {
  return <div className={r.late ? "bg-amber-50/40" : ""}>
    <button type="button" onClick={toggle} aria-expanded={on} className="grid w-full grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-3 text-right transition hover:bg-[var(--sky-light)] sm:px-5 md:grid-cols-[minmax(0,1fr)_130px_120px_110px]">
      <span className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.status === "settled" ? "bg-emerald-500" : r.status === "collected" ? "bg-amber-500" : "bg-slate-400"}`} />
        <span className="min-w-0"><b className="block truncate text-[14px] text-[var(--ink)]">{r.supplier} <span className="font-normal text-[var(--muted)]">← {r.client}</span></b>
          <span className="text-[11px] text-[var(--muted)]">{r.order_date}{r.ref ? ` · فاتورة ${r.ref}` : ""} · {r.items.length} صنف{r.late ? ` · ⏰ ${r.age} يوم` : ""}</span></span></span>
      <span className="text-left"><span className="text-[10px] text-[var(--muted)] md:hidden">المطلوب </span><b className="text-[15px] tabular-nums text-[var(--navy)]">{r.open ? sar(r.open) : "—"}</b>
        {r.short > 0 && <span className="block text-[10px] font-bold text-red-700">خصم ناقص</span>}</span>
      <span className="text-left"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${ST[r.status]}`}>{STATUS_LABEL[r.status]}</span></span>
      <span className="text-left tabular-nums text-[var(--muted)]"><span className="text-[10px] md:hidden">الإجمالي </span>{sar(r.amount)}</span>
    </button>
    {on && <div className="bg-[var(--bg)] px-4 pb-3 pt-1 sm:px-5">
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="grid grid-cols-[minmax(0,1fr)_60px_90px_90px_90px] gap-2 bg-[var(--sky-light)] px-3 py-1.5 text-[10.5px] font-bold text-[var(--muted)]">
          <span>الصنف</span><span className="text-left">كمية</span><span className="text-left">سعر العميل</span><span className="text-left">سعري</span><span className="text-left">الفرق</span></div>
        {r.items.map((it, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_60px_90px_90px_90px] gap-2 px-3 py-1.5 text-[12.5px]">
          <span className="truncate">{it.item}</span><span className="text-left tabular-nums">{it.qty}</span>
          <span className="text-left tabular-nums text-[var(--muted)]">{k(it.client_price)}</span><span className="text-left tabular-nums text-[var(--muted)]">{k(it.my_price)}</span>
          <b className="text-left tabular-nums">{k(lineAmount(it))}</b></div>)}
      </div>
      {r.status === "settled" && <div className="mt-2 text-[12px] text-[var(--muted)]">اتخصم {sar(r.settled_amount)} بتاريخ {r.settled_at}{r.short > 0 ? <span className="font-bold text-red-700"> · باقي {sar(r.short)} ما اتخصمش</span> : ""}</div>}
      {r.note && <div className="mt-1 text-[12px] text-[var(--muted)]">📝 {r.note}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {r.status === "printed" && <Act onClick={() => { const date = prompt("تاريخ تحصيل المورد من العميل (YYYY-MM-DD):", today); if (date) void move(r.id, { action: "collect", date }, "اتسجل إن المورد حصّل"); }}>المورد حصّل</Act>}
        {r.status === "collected" && <Act onClick={() => void move(r.id, { action: "uncollect" }, "رجع لاتطبع")}>تراجع</Act>}
        {r.status !== "settled" && <Act primary onClick={() => { const date = prompt("تاريخ المقاصة (YYYY-MM-DD):", today); if (!date) return; const amount = prompt(`المبلغ اللي اتخصم فعلاً (المحسوب ${k(r.amount)}):`, String(Math.round(r.amount))); if (amount !== null) void move(r.id, { action: "settle", date, amount }, "اتسجلت المقاصة"); }}>سجّل المقاصة</Act>}
        {r.status === "settled" && <Act onClick={() => void move(r.id, { action: "unsettle" }, "اتفتحت المقاصة")}>افتح المقاصة</Act>}
        {r.short > 0 && <Act onClick={() => void move(r.id, { action: "close_short" }, "اتقفل الفرق")}>اقفل الفرق الناقص</Act>}
        <Act onClick={msg}>رسالة واتساب</Act>
        <Act onClick={openSup}>كشف حساب المورد</Act>
        {r.status !== "settled" && <Act onClick={edit}>تعديل</Act>}
        <Act danger onClick={() => del(r.id)}>مسح</Act>
      </div>
    </div>}
  </div>;
}

function Act({ children, onClick, primary, danger }: { children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-bold ${primary ? "bg-[var(--navy)] text-white" : danger ? "border border-red-200 bg-white text-red-700" : "border border-[var(--border)] bg-[var(--card)] text-[var(--navy)]"}`}>{children}</button>;
}

/* ───────── order form ───────── */
function OrderForm({ order, d, onClose, reload, toast }: { order: OffsetOrder | "new"; d: Data; onClose: () => void; reload: () => Promise<void>; toast: (m: string, t?: "success" | "error") => void }) {
  const isNew = order === "new";
  const o = isNew ? null : order;
  const [supplier, setSupplier] = useState(o?.supplier || "");
  const [client, setClient] = useState(o?.client || "");
  const [date, setDate] = useState(o?.order_date || d.today);
  const [ref, setRef] = useState(o?.ref || "");
  const [note, setNote] = useState(o?.note || "");
  const [items, setItems] = useState<OffsetItem[]>(o?.items.length ? o.items : [{ item: "", product_id: null, qty: 1, client_price: 0, my_price: 0 }]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);

  const setIt = (i: number, patch: Partial<OffsetItem>) => setItems(xs => xs.map((it, j) => j === i ? { ...it, ...patch } : it));
  // when the item name matches an agreed price for this supplier+client, prefill the two prices
  const fill = (i: number, name: string) => {
    const p = priceFor(d.prices, supplier, client, name);
    setIt(i, p ? { item: name, product_id: p.product_id, client_price: p.client_price, my_price: p.my_price } : { item: name });
  };
  const total = orderAmount({ items });

  async function save() {
    setSaving(true);
    const body = { supplier, client, order_date: date, ref, note, items };
    const r = await fetch("/api/admin/finance/offsets/orders", { method: isNew ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(isNew ? body : { id: o!.id, ...body }) });
    const j = await r.json().catch(() => null); setSaving(false);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast(isNew ? "اتسجل الأوردر" : "اتعدّل", "success"); await reload(); onClose();
  }

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#0b1d20]/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <div dir="rtl" onClick={e => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[var(--card)] sm:rounded-3xl">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
        <b className="text-[15px]">{isNew ? "أوردر مقاصة جديد" : "تعديل الأوردر"}</b>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-[var(--sky-light)]">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="المورد"><input list="off-sup" value={supplier} onChange={e => setSupplier(e.target.value)} className={inp} placeholder="اسم المورد" /></Field>
          <Field label="العميل"><input list="off-cli" value={client} onChange={e => setClient(e.target.value)} className={inp} placeholder="العميل اللي المورد بيطبع له" /></Field>
          <Field label="تاريخ الطباعة"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} /></Field>
          <Field label="رقم فاتورة المورد (اختياري)"><input value={ref} onChange={e => setRef(e.target.value)} className={inp} placeholder="للرجوع إليها" /></Field>
        </div>
        <datalist id="off-sup">{d.suppliers_list.map(s => <option key={s} value={s} />)}</datalist>
        <datalist id="off-cli">{d.clients_list.map(c => <option key={c} value={c} />)}</datalist>
        <datalist id="off-prod">{d.products.map(p => <option key={p.id} value={p.name} />)}</datalist>

        <div className="mt-4 mb-1 flex items-center justify-between"><b className="text-[13px]">الأصناف والكميات</b>
          <span className="text-[11px] text-[var(--muted)]">الفرق = (سعر العميل − سعري) × الكمية</span></div>
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_64px_92px_92px_84px_28px] gap-1.5 px-1 text-[10.5px] font-bold text-[var(--muted)] sm:grid">
            <span>الصنف</span><span>كمية</span><span>سعر العميل</span><span>سعري</span><span>الفرق</span><span /></div>
          {items.map((it, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_92px_92px_84px_28px] items-center gap-1.5">
            <input list="off-prod" value={it.item} onChange={e => fill(i, e.target.value)} className={inp} placeholder="اسم الصنف" />
            <input type="number" step="any" min="0" value={it.qty || ""} onChange={e => setIt(i, { qty: Number(e.target.value) })} className={inp} />
            <input type="number" step="any" min="0" value={it.client_price || ""} onChange={e => setIt(i, { client_price: Number(e.target.value) })} className={inp} />
            <input type="number" step="any" min="0" value={it.my_price || ""} onChange={e => setIt(i, { my_price: Number(e.target.value) })} className={inp} />
            <b className="tabular-nums text-[13px] text-[var(--navy)]">{k(lineAmount(it))}</b>
            <button type="button" onClick={() => setItems(xs => xs.length > 1 ? xs.filter((_, j) => j !== i) : xs)} aria-label="شيل" className="text-[var(--muted)] hover:text-red-600">✕</button>
          </div>)}
        </div>
        <button type="button" onClick={() => setItems(xs => [...xs, { item: "", product_id: null, qty: 1, client_price: 0, my_price: 0 }])} className="mt-2 rounded-full border border-dashed border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">+ صنف</button>

        <Field label="ملاحظة (اختياري)" className="mt-3"><input value={note} onChange={e => setNote(e.target.value)} className={inp} /></Field>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
        <span className="text-sm">المطلوب للمقاصة: <b className="text-[17px] tabular-nums text-[var(--navy)]">{sar(total)}</b></span>
        <span className="flex gap-2"><button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-bold text-[var(--muted)]">إلغاء</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-full bg-[var(--navy)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "جارٍ الحفظ…" : "حفظ"}</button></span>
      </div>
    </div>
  </div>;
}

/* ───────── agreed prices ───────── */
function Prices({ d, reload, toast }: { d: Data; reload: () => Promise<void>; toast: (m: string, t?: "success" | "error") => void }) {
  const [supplier, setSupplier] = useState(""); const [client, setClient] = useState(""); const [item, setItem] = useState("");
  const [cp, setCp] = useState(""); const [mp, setMp] = useState(""); const [saving, setSaving] = useState(false);
  async function add() {
    setSaving(true);
    const r = await fetch("/api/admin/finance/offsets/prices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplier, client, item, client_price: cp, my_price: mp }) });
    const j = await r.json().catch(() => null); setSaving(false);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتسجل السعر", "success"); setItem(""); setCp(""); setMp(""); await reload();
  }
  async function del(id: number) { const r = await fetch(`/api/admin/finance/offsets/prices?id=${id}`, { method: "DELETE" }); if (r.ok) { toast("اتمسح", "success"); await reload(); } }
  const diff = (Number(cp) || 0) - (Number(mp) || 0);
  return <div className="space-y-4">
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <b className="text-[14px]">سجّل سعر متفق عليه</b>
      <p className="mb-3 mt-0.5 text-[12px] text-[var(--muted)]">سيبّ العميل فاضي لو السعر واحد لكل العملاء عند المورد ده. السعر بيظهر لوحده لما تكتب الصنف في الأوردر.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        <input list="off-sup" value={supplier} onChange={e => setSupplier(e.target.value)} className={inp} placeholder="المورد" />
        <input list="off-cli" value={client} onChange={e => setClient(e.target.value)} className={inp} placeholder="العميل (أو الكل)" />
        <input list="off-prod" value={item} onChange={e => setItem(e.target.value)} className={inp} placeholder="الصنف" />
        <input type="number" step="any" min="0" value={cp} onChange={e => setCp(e.target.value)} className={inp} placeholder="سعر العميل" />
        <input type="number" step="any" min="0" value={mp} onChange={e => setMp(e.target.value)} className={inp} placeholder="سعري من المورد" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12px] text-[var(--muted)]">الفرق لكل قطعة: <b className="tabular-nums text-[var(--navy)]">{k(diff)} ر.س</b></span>
        <button type="button" disabled={saving || !supplier || !item} onClick={() => void add()} className="rounded-full bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "…" : "حفظ السعر"}</button>
      </div>
      <datalist id="off-sup">{d.suppliers_list.map(s => <option key={s} value={s} />)}</datalist>
      <datalist id="off-cli">{d.clients_list.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="off-prod">{d.products.map(p => <option key={p.id} value={p.name} />)}</datalist>
    </div>
    <div className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)]">
      {!d.prices.length ? <div className="p-8 text-center text-sm text-[var(--muted)]">لسه مفيش أسعار متفق عليها</div>
        : <div className="-mx-0 overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
          <thead className="bg-[var(--sky-light)] text-[11px] text-[var(--muted)]"><tr><th className="p-2.5 text-right">المورد</th><th className="p-2.5 text-right">العميل</th><th className="p-2.5 text-right">الصنف</th><th className="p-2.5 text-left">سعر العميل</th><th className="p-2.5 text-left">سعري</th><th className="p-2.5 text-left">الفرق</th><th /></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{d.prices.map(p => <tr key={p.id}>
            <td className="p-2.5 font-bold">{p.supplier}</td><td className="p-2.5 text-[var(--muted)]">{p.client || "الكل"}</td><td className="p-2.5">{p.item}</td>
            <td className="p-2.5 text-left tabular-nums text-[var(--muted)]">{k(p.client_price)}</td><td className="p-2.5 text-left tabular-nums text-[var(--muted)]">{k(p.my_price)}</td>
            <td className="p-2.5 text-left font-bold tabular-nums text-[var(--navy)]">{k(p.client_price - p.my_price)}</td>
            <td className="p-2.5 text-left"><button type="button" onClick={() => void del(p.id)} aria-label="مسح" className="text-[var(--muted)] hover:text-red-600">✕</button></td></tr>)}</tbody>
        </table></div>}
    </div>
  </div>;
}

const inp = "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm";
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-[12px] font-semibold text-[var(--muted)]">{label}</span>{children}</label>;
}
