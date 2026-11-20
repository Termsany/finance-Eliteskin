"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Card, Kpi, sar, C } from "./kit";

type SubTab = "reps" | "samples" | "promo";
const SUB_TABS: Array<[SubTab, string, string]> = [["reps", "المناديب", "reps"], ["samples", "العينات", "samples"], ["promo", "الدعاية", "gift"]];

type DaftraClient = { id: number; name: string };
type RepRow = { id: number; name: string; active: boolean; sample_pct: number | null; promo_pct: number | null; clients: number[] };
type Product = { id: number; name: string; average_cost: number };
type SampleSummary = { rep_id: number; rep_name: string; budget: number; prev_sales: number; sample_pct: number; used: number; remaining: number; pct_used: number };
type PromoSummary = { rep_id: number; rep_name: string; budget: number; prev_sales: number; promo_pct: number; used: number; remaining: number; pct_used: number };
type SampleRecRow = { id: number; rep_id: number; month: string; dispensed_at: string; total_value: number; over_budget: boolean; override_reason: string | null; notes: string; rep_name: string };
type PromoRow = { id: number; rep_id: number; month: string; expense_date: string; promo_type: string; other_desc: string; amount: number; place: string; doctors: string[]; attendees: number; notes: string; over_budget: boolean; override_reason: string | null; rep_name: string };

type OverBudgetInfo = { budget: number; used: number; adding: number; overage: number; pct_after: number };

const PROMO_LABELS: Record<string, string> = { pms: "PMS", lunch: "دعوة غداء", rtd: "RTD", other: "أخرى" };
const months = () => { const d = new Date(); const list: string[] = []; for (let i = 0; i < 12; i++) { list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1); } return list; };

export function SamplesTab() {
  const [sub, setSub] = useState<SubTab>("samples");
  return <div className="space-y-4">
    <div className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
      {SUB_TABS.map(([k, l, ic]) => <button key={k} type="button" onClick={() => setSub(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${sub === k ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}><Icon name={ic} size={14} />{l}</button>)}
    </div>
    {sub === "reps" && <RepsPanel />}
    {sub === "samples" && <SamplesPanel />}
    {sub === "promo" && <PromoPanel />}
  </div>;
}

function RepsPanel() {
  const toast = useToast();
  const [reps, setReps] = useState<RepRow[]>([]);
  const [clients, setClients] = useState<DaftraClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RepRow | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/admin/reps").then(r => r.json()).catch(() => null);
    if (j?.reps) { setReps(j.reps); setClients(j.daftra_clients); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <Card title="المناديب" right={<button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white"><Icon name="new-visit" size={14} />إضافة مندوب</button>}>
    {loading ? <div className="animate-pulse h-20 rounded-xl bg-[var(--bg)]" /> :
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
          <th className="pb-2 text-right font-bold">الاسم</th>
          <th className="pb-2 text-right font-bold">عملاء دفترة</th>
          <th className="pb-2 text-right font-bold">نسبة العينات</th>
          <th className="pb-2 text-right font-bold">نسبة الدعاية</th>
          <th className="pb-2 text-right font-bold">الحالة</th>
          <th className="pb-2" />
        </tr></thead>
        <tbody>{reps.map(r => <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
          <td className="py-2.5 font-bold">{r.name}</td>
          <td className="py-2.5 text-xs text-[var(--muted)]">{r.clients.length ? `${r.clients.length} عميل` : <span className="text-amber-600">لم يتم الربط</span>}</td>
          <td className="py-2.5 text-xs">{r.sample_pct != null ? `${r.sample_pct}%` : <span className="text-[var(--muted)]">عام</span>}</td>
          <td className="py-2.5 text-xs">{r.promo_pct != null ? `${r.promo_pct}%` : <span className="text-[var(--muted)]">عام</span>}</td>
          <td className="py-2.5"><span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${r.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.active ? "فعّال" : "معطّل"}</span></td>
          <td className="py-2.5"><button type="button" onClick={() => setEditing(r)} className="text-xs font-bold text-[var(--navy)] hover:underline">تعديل</button></td>
        </tr>)}</tbody>
      </table></div>}
    {reps.length === 0 && !loading && <p className="py-6 text-center text-sm text-[var(--muted)]">مفيش مناديب. اضغط «إضافة مندوب» عشان تبدأ.</p>}
    {(adding || editing) && <RepForm rep={editing} clients={clients} onClose={() => { setAdding(false); setEditing(null); }} onSave={async () => { setAdding(false); setEditing(null); await load(); toast("تم الحفظ", "success"); }} />}
  </Card>;
}

function RepForm({ rep, clients, onClose, onSave }: { rep: RepRow | null; clients: DaftraClient[]; onClose: () => void; onSave: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(rep?.name || "");
  const [active, setActive] = useState(rep?.active ?? true);
  const [selectedClients, setSelectedClients] = useState<number[]>(rep?.clients || []);
  const [samplePct, setSamplePct] = useState<string>(rep?.sample_pct != null ? String(rep.sample_pct) : "");
  const [promoPct, setPromoPct] = useState<string>(rep?.promo_pct != null ? String(rep.promo_pct) : "");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? clients.filter(c => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, search]);

  async function save() {
    if (!name.trim()) { toast("اسم المندوب مطلوب", "error"); return; }
    setSaving(true);
    const body = {
      name: name.trim(), active,
      clients: selectedClients,
      sample_pct: samplePct ? Number(samplePct) : null,
      promo_pct: promoPct ? Number(promoPct) : null,
    };
    const url = rep ? `/api/admin/reps/${rep.id}` : "/api/admin/reps";
    const r = await fetch(url, { method: rep ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { const j = await r.json().catch(() => null); toast(j?.error || "حصل خطأ", "error"); return; }
    onSave();
  }

  async function del() {
    if (!rep || !confirm("حذف المندوب؟ ده هيحذف كل سجلات العينات والدعاية الخاصة بيه.")) return;
    await fetch(`/api/admin/reps/${rep.id}`, { method: "DELETE" });
    onSave();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
    <div className="mx-4 w-full max-w-lg rounded-2xl bg-[var(--card)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
      <h3 className="mb-4 font-extrabold text-[var(--navy)]">{rep ? "تعديل المندوب" : "إضافة مندوب"}</h3>
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">اسم المندوب</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="مثلاً: أحمد" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">نسبة العينات %</label>
            <input type="number" value={samplePct} onChange={e => setSamplePct(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="عام" min="0" max="100" step="0.5" /></div>
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">نسبة الدعاية %</label>
            <input type="number" value={promoPct} onChange={e => setPromoPct(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="عام" min="0" max="100" step="0.5" /></div>
        </div>
        {rep && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> فعّال</label>}
        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--muted)]">عملاء دفترة ({selectedClients.length} مختار)</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن عميل…" className="mb-2 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
            {filtered.map(c => <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-[var(--sky-light)]">
              <input type="checkbox" checked={selectedClients.includes(c.id)} onChange={e => setSelectedClients(e.target.checked ? [...selectedClients, c.id] : selectedClients.filter(x => x !== c.id))} />
              <span className="min-w-0 truncate">{c.name}</span>
            </label>)}
            {filtered.length === 0 && <p className="p-2 text-center text-xs text-[var(--muted)]">مفيش نتايج</p>}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div>{rep && <button type="button" onClick={() => void del()} className="text-xs font-bold text-red-600 hover:underline">حذف</button>}</div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--muted)] hover:bg-[var(--bg)]">إلغاء</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ…" : "حفظ"}</button>
        </div>
      </div>
    </div>
  </div>;
}

function SamplesPanel() {
  const toast = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [data, setData] = useState<{ summaries: SampleSummary[]; records: SampleRecRow[]; products: Product[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispensing, setDispensing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/samples?month=${month}`).then(r => r.json()).catch(() => null);
    if (j?.summaries) setData(j);
    setLoading(false);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const totalBudget = data?.summaries.reduce((s, r) => s + r.budget, 0) ?? 0;
  const totalUsed = data?.summaries.reduce((s, r) => s + r.used, 0) ?? 0;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <select value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
        {months().map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button type="button" onClick={() => setDispensing(true)} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white"><Icon name="samples" size={14} />صرف عينات</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi label="إجمالي رصيد العينات" value={sar(totalBudget)} icon="samples" color={C.violet} />
      <Kpi label="المستخدم" value={sar(totalUsed)} icon="wallet" color={totalUsed > totalBudget ? C.red : C.teal} />
      <Kpi label="المتبقي" value={sar(totalBudget - totalUsed)} icon="check" color={totalBudget - totalUsed < 0 ? C.red : C.green} />
    </div>
    <Card title="رصيد كل مندوب">
      {loading ? <div className="h-20 animate-pulse rounded-xl bg-[var(--bg)]" /> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
            <th className="pb-2 text-right font-bold">المندوب</th>
            <th className="pb-2 text-right font-bold">مبيعات الشهر السابق</th>
            <th className="pb-2 text-right font-bold">النسبة</th>
            <th className="pb-2 text-right font-bold">الرصيد</th>
            <th className="pb-2 text-right font-bold">المستخدم</th>
            <th className="pb-2 text-right font-bold">المتبقي</th>
            <th className="pb-2 text-right font-bold">الاستخدام</th>
          </tr></thead>
          <tbody>{data?.summaries.map(s => <tr key={s.rep_id} className="border-b border-[var(--border)] last:border-0">
            <td className="py-2 font-bold">{s.rep_name}</td>
            <td className="py-2 text-xs">{sar(s.prev_sales)}</td>
            <td className="py-2 text-xs">{s.sample_pct}%</td>
            <td className="py-2 text-xs font-bold">{sar(s.budget)}</td>
            <td className="py-2 text-xs">{sar(s.used)}</td>
            <td className={`py-2 text-xs font-bold ${s.remaining < 0 ? "text-red-600" : ""}`}>{sar(s.remaining)}</td>
            <td className="py-2"><BudgetBar pct={s.pct_used} /></td>
          </tr>)}</tbody>
        </table></div>}
      {data?.summaries.length === 0 && !loading && <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش مناديب. اضف مناديب من تبويب «المناديب» الأول.</p>}
    </Card>
    <Card title="سجل الصرف">
      {data?.records.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش سجلات صرف بعد.</p>}
      {data?.records.map(r => <div key={r.id} className={`mb-2 rounded-xl border p-3 text-sm ${r.over_budget ? "border-red-200 bg-red-50" : "border-[var(--border)]"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{r.rep_name}</span>
          <span className="text-xs text-[var(--muted)]">{r.dispensed_at.slice(0, 10)}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs">
          <span className="font-bold">{sar(r.total_value)}</span>
          <span className="text-[var(--muted)]">{r.month}</span>
          {r.over_budget && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">تجاوز</span>}
        </div>
        {r.override_reason && <p className="mt-1 text-xs text-red-700">السبب: {r.override_reason}</p>}
        {r.notes && <p className="mt-1 text-xs text-[var(--muted)]">{r.notes}</p>}
      </div>)}
    </Card>
    {dispensing && data && <DispenseForm products={data.products} summaries={data.summaries} month={month} onClose={() => setDispensing(false)} onSave={async () => { setDispensing(false); await load(); toast("تم صرف العينات", "success"); }} />}
  </div>;
}

function BudgetBar({ pct }: { pct: number }) {
  const color = pct > 100 ? C.red : pct > 80 ? C.amber : C.green;
  return <div className="flex items-center gap-2">
    <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>
    <span className="text-[10px] font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
  </div>;
}

function DispenseForm({ products, summaries, month, onClose, onSave }: { products: Product[]; summaries: SampleSummary[]; month: string; onClose: () => void; onSave: () => void }) {
  const toast = useToast();
  const [repId, setRepId] = useState<number | null>(null);
  const [items, setItems] = useState<Array<{ product_id: number; product_name: string; quantity: number; unit_cost: number }>>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [overBudgetInfo, setOverBudgetInfo] = useState<OverBudgetInfo | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const rep = summaries.find(s => s.rep_id === repId);
  const totalValue = items.reduce((s, it) => s + it.quantity * it.unit_cost, 0);
  const afterUsage = (rep?.used ?? 0) + totalValue;
  const isOver = rep ? afterUsage > rep.budget : false;

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
  }, [products, productSearch]);

  function addItem(p: Product) {
    if (items.some(it => it.product_id === p.id)) return;
    setItems([...items, { product_id: p.id, product_name: p.name, quantity: 1, unit_cost: p.average_cost }]);
    setProductSearch("");
  }
  function updateQty(pid: number, qty: number) {
    setItems(items.map(it => it.product_id === pid ? { ...it, quantity: Math.max(0.1, qty) } : it));
  }
  function removeItem(pid: number) { setItems(items.filter(it => it.product_id !== pid)); }

  async function submit(reason?: string) {
    if (!repId || !items.length) { toast("اختار مندوب وأضف أصناف", "error"); return; }
    setSaving(true);
    const r = await fetch("/api/admin/samples", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ rep_id: repId, month, items, notes, override_reason: reason }),
    });
    const j = await r.json().catch(() => null);
    setSaving(false);
    if (r.status === 422 && j?.over_budget) { setOverBudgetInfo(j as OverBudgetInfo); return; }
    if (!r.ok) { toast(j?.error || "حصل خطأ", "error"); return; }
    onSave();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-xl rounded-2xl bg-[var(--card)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
      <h3 className="mb-4 font-extrabold text-[var(--navy)]">صرف عينات — {month}</h3>

      <div className="mb-3"><label className="mb-1 block text-xs font-bold text-[var(--muted)]">المندوب</label>
        <select value={repId ?? ""} onChange={e => setRepId(Number(e.target.value) || null)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          <option value="">اختار المندوب</option>
          {summaries.map(s => <option key={s.rep_id} value={s.rep_id}>{s.rep_name}</option>)}
        </select>
      </div>

      {rep && <div className={`mb-3 rounded-xl p-3 text-sm ${isOver ? "bg-red-50 ring-1 ring-red-200" : "bg-[var(--sky-light)]"}`}>
        <div className="flex justify-between gap-2 text-xs"><span>الرصيد: <b>{sar(rep.budget)}</b></span><span>المستخدم: <b>{sar(rep.used)}</b></span><span>بعد الصرف: <b className={isOver ? "text-red-700" : ""}>{sar(afterUsage)}</b></span></div>
        <BudgetBar pct={rep.budget > 0 ? afterUsage / rep.budget * 100 : 0} />
      </div>}

      <div className="mb-3">
        <label className="mb-1 block text-xs font-bold text-[var(--muted)]">أضف أصناف</label>
        <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="ابحث عن صنف…" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        {productSearch && <div className="mt-1 max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] bg-white">
          {filteredProducts.map(p => <button key={p.id} type="button" onClick={() => addItem(p)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-right text-xs hover:bg-[var(--sky-light)]">
            <span>{p.name}</span><span className="text-[var(--muted)]">تكلفة: {sar(p.average_cost)}</span>
          </button>)}
          {filteredProducts.length === 0 && <p className="p-2 text-center text-xs text-[var(--muted)]">مفيش نتايج</p>}
        </div>}
      </div>

      {items.length > 0 && <div className="mb-3 overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b border-[var(--border)] text-[var(--muted)]">
          <th className="pb-1 text-right">الصنف</th><th className="pb-1 text-right">الكمية</th><th className="pb-1 text-right">تكلفة الوحدة</th><th className="pb-1 text-right">الإجمالي</th><th />
        </tr></thead>
        <tbody>{items.map(it => <tr key={it.product_id} className="border-b border-[var(--border)] last:border-0">
          <td className="py-1.5 font-bold">{it.product_name}</td>
          <td className="py-1.5"><input type="number" value={it.quantity} onChange={e => updateQty(it.product_id, Number(e.target.value))} min="0.1" step="1" className="w-16 rounded border border-[var(--border)] px-2 py-1 text-center" /></td>
          <td className="py-1.5">{sar(it.unit_cost, 2)}</td>
          <td className="py-1.5 font-bold">{sar(it.quantity * it.unit_cost, 2)}</td>
          <td className="py-1.5"><button type="button" onClick={() => removeItem(it.product_id)} className="text-red-500"><Icon name="x" size={14} /></button></td>
        </tr>)}</tbody>
        <tfoot><tr className="font-bold"><td colSpan={3} className="pt-2">الإجمالي</td><td className="pt-2">{sar(totalValue, 2)}</td><td /></tr></tfoot>
      </table></div>}

      <div className="mb-3"><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" rows={2} /></div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--muted)]">إلغاء</button>
        <button type="button" disabled={saving || !repId || !items.length} onClick={() => void submit()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ…" : "اعتماد الصرف"}</button>
      </div>
    </div>

    {overBudgetInfo && <OverBudgetModal info={overBudgetInfo} reason={overrideReason} onReasonChange={setOverrideReason} onCancel={() => setOverBudgetInfo(null)}
      onConfirm={() => { if (!overrideReason.trim()) { toast("لازم تكتب سبب التجاوز", "error"); return; } setOverBudgetInfo(null); void submit(overrideReason); }} />}
  </div>;
}

function PromoPanel() {
  const toast = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [data, setData] = useState<{ summaries: PromoSummary[]; expenses: PromoRow[]; known_doctors: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/promo?month=${month}`).then(r => r.json()).catch(() => null);
    if (j?.summaries) setData(j);
    setLoading(false);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const totalBudget = data?.summaries.reduce((s, r) => s + r.budget, 0) ?? 0;
  const totalUsed = data?.summaries.reduce((s, r) => s + r.used, 0) ?? 0;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <select value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
        {months().map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white"><Icon name="gift" size={14} />تسجيل مصروف دعائي</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi label="إجمالي رصيد الدعاية" value={sar(totalBudget)} icon="gift" color={C.violet} />
      <Kpi label="المستخدم" value={sar(totalUsed)} icon="wallet" color={totalUsed > totalBudget ? C.red : C.teal} />
      <Kpi label="المتبقي" value={sar(totalBudget - totalUsed)} icon="check" color={totalBudget - totalUsed < 0 ? C.red : C.green} />
    </div>
    <Card title="رصيد كل مندوب">
      {loading ? <div className="h-20 animate-pulse rounded-xl bg-[var(--bg)]" /> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
            <th className="pb-2 text-right font-bold">المندوب</th>
            <th className="pb-2 text-right font-bold">مبيعات الشهر السابق</th>
            <th className="pb-2 text-right font-bold">النسبة</th>
            <th className="pb-2 text-right font-bold">الرصيد</th>
            <th className="pb-2 text-right font-bold">المستخدم</th>
            <th className="pb-2 text-right font-bold">المتبقي</th>
            <th className="pb-2 text-right font-bold">الاستخدام</th>
          </tr></thead>
          <tbody>{data?.summaries.map(s => <tr key={s.rep_id} className="border-b border-[var(--border)] last:border-0">
            <td className="py-2 font-bold">{s.rep_name}</td>
            <td className="py-2 text-xs">{sar(s.prev_sales)}</td>
            <td className="py-2 text-xs">{s.promo_pct}%</td>
            <td className="py-2 text-xs font-bold">{sar(s.budget)}</td>
            <td className="py-2 text-xs">{sar(s.used)}</td>
            <td className={`py-2 text-xs font-bold ${s.remaining < 0 ? "text-red-600" : ""}`}>{sar(s.remaining)}</td>
            <td className="py-2"><BudgetBar pct={s.pct_used} /></td>
          </tr>)}</tbody>
        </table></div>}
    </Card>
    <Card title="سجل المصروفات الدعائية">
      {data?.expenses.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش مصروفات دعائية بعد.</p>}
      {data?.expenses.map(e => <div key={e.id} className={`mb-2 rounded-xl border p-3 text-sm ${e.over_budget ? "border-red-200 bg-red-50" : "border-[var(--border)]"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{e.rep_name}</span>
          <span className="text-xs text-[var(--muted)]">{e.expense_date}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold">{sar(e.amount)}</span>
          <span className="rounded bg-[var(--sky-light)] px-1.5 py-0.5 font-bold">{PROMO_LABELS[e.promo_type]}{e.promo_type === "other" && e.other_desc ? `: ${e.other_desc}` : ""}</span>
          {e.place && <span className="text-[var(--muted)]">{e.place}</span>}
          {e.over_budget && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">تجاوز</span>}
        </div>
        {e.doctors.length > 0 && <p className="mt-1 text-xs text-[var(--muted)]">الأطباء: {e.doctors.join("، ")}</p>}
        {e.override_reason && <p className="mt-1 text-xs text-red-700">سبب التجاوز: {e.override_reason}</p>}
      </div>)}
    </Card>
    {adding && data && <PromoForm summaries={data.summaries} knownDoctors={data.known_doctors} onClose={() => setAdding(false)} onSave={async () => { setAdding(false); await load(); toast("تم التسجيل", "success"); }} />}
  </div>;
}

function PromoForm({ summaries, knownDoctors, onClose, onSave }: { summaries: PromoSummary[]; knownDoctors: string[]; onClose: () => void; onSave: () => void }) {
  const toast = useToast();
  const [repId, setRepId] = useState<number | null>(null);
  const [expenseDate, setExpenseDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()));
  const [promoType, setPromoType] = useState<string>("pms");
  const [otherDesc, setOtherDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [place, setPlace] = useState("");
  const [doctors, setDoctors] = useState<string[]>([]);
  const [doctorInput, setDoctorInput] = useState("");
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [overBudgetInfo, setOverBudgetInfo] = useState<OverBudgetInfo | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const rep = summaries.find(s => s.rep_id === repId);
  const amt = Number(amount) || 0;
  const afterUsage = (rep?.used ?? 0) + amt;
  const isOver = rep ? afterUsage > rep.budget : false;

  const suggestions = useMemo(() => {
    const q = doctorInput.trim().toLowerCase();
    if (!q) return [];
    return knownDoctors.filter(d => d.toLowerCase().includes(q) && !doctors.includes(d)).slice(0, 8);
  }, [doctorInput, knownDoctors, doctors]);

  function addDoctor(name: string) {
    const n = name.trim();
    if (n && !doctors.includes(n)) setDoctors([...doctors, n]);
    setDoctorInput("");
  }

  async function submit(reason?: string) {
    if (!repId || !amount || !expenseDate) { toast("بيانات ناقصة", "error"); return; }
    if (promoType === "other" && !otherDesc.trim()) { toast("اكتب وصف النوع", "error"); return; }
    setSaving(true);
    const r = await fetch("/api/admin/promo", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ rep_id: repId, expense_date: expenseDate, promo_type: promoType, other_desc: otherDesc, amount: Number(amount), place, doctors, attendees: Number(attendees) || 0, notes, override_reason: reason }),
    });
    const j = await r.json().catch(() => null);
    setSaving(false);
    if (r.status === 422 && j?.over_budget) { setOverBudgetInfo(j as OverBudgetInfo); return; }
    if (!r.ok) { toast(j?.error || "حصل خطأ", "error"); return; }
    onSave();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-lg rounded-2xl bg-[var(--card)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
      <h3 className="mb-4 font-extrabold text-[var(--navy)]">تسجيل مصروف دعائي</h3>
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">المندوب</label>
          <select value={repId ?? ""} onChange={e => setRepId(Number(e.target.value) || null)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">اختار المندوب</option>
            {summaries.map(s => <option key={s.rep_id} value={s.rep_id}>{s.rep_name}</option>)}
          </select>
        </div>
        {rep && <div className={`rounded-xl p-3 text-xs ${isOver ? "bg-red-50 ring-1 ring-red-200" : "bg-[var(--sky-light)]"}`}>
          <div className="flex justify-between gap-2"><span>الرصيد: <b>{sar(rep.budget)}</b></span><span>المستخدم: <b>{sar(rep.used)}</b></span><span>بعد الصرف: <b className={isOver ? "text-red-700" : ""}>{sar(afterUsage)}</b></span></div>
          <BudgetBar pct={rep.budget > 0 ? afterUsage / rep.budget * 100 : 0} />
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">النوع</label>
            <select value={promoType} onChange={e => setPromoType(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              {Object.entries(PROMO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">التاريخ</label>
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
        </div>
        {promoType === "other" && <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">وصف النوع</label>
          <input value={otherDesc} onChange={e => setOtherDesc(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="مثلاً: معرض طبي" /></div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">المبلغ (ر.س)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" min="0" step="0.01" /></div>
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">المكان</label>
            <input value={place} onChange={e => setPlace(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-[var(--muted)]">الأطباء</label>
          <div className="flex flex-wrap gap-1 mb-1">{doctors.map(d => <span key={d} className="flex items-center gap-1 rounded-lg bg-[var(--sky-light)] px-2 py-0.5 text-xs font-bold">{d}<button type="button" onClick={() => setDoctors(doctors.filter(x => x !== d))} className="text-red-500"><Icon name="x" size={10} /></button></span>)}</div>
          <div className="relative">
            <input value={doctorInput} onChange={e => setDoctorInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && doctorInput.trim()) { e.preventDefault(); addDoctor(doctorInput); } }}
              placeholder="اكتب اسم الطبيب واضغط Enter" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
            {suggestions.length > 0 && <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] bg-white shadow-lg">
              {suggestions.map(s => <button key={s} type="button" onClick={() => addDoctor(s)} className="block w-full px-3 py-1.5 text-right text-xs hover:bg-[var(--sky-light)]">{s}</button>)}
            </div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">عدد الحضور</label>
            <input type="number" value={attendees} onChange={e => setAttendees(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" min="0" /></div>
        </div>
        <div><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" rows={2} /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--muted)]">إلغاء</button>
        <button type="button" disabled={saving || !repId || !amount} onClick={() => void submit()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ…" : "اعتماد"}</button>
      </div>
    </div>
    {overBudgetInfo && <OverBudgetModal info={overBudgetInfo} reason={overrideReason} onReasonChange={setOverrideReason} onCancel={() => setOverBudgetInfo(null)}
      onConfirm={() => { if (!overrideReason.trim()) { toast("لازم تكتب سبب التجاوز", "error"); return; } setOverBudgetInfo(null); void submit(overrideReason); }} />}
  </div>;
}

function OverBudgetModal({ info, reason, onReasonChange, onCancel, onConfirm }: {
  info: OverBudgetInfo; reason: string; onReasonChange: (v: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onCancel}>
    <div className="mx-4 w-full max-w-sm rounded-2xl bg-red-50 p-5 shadow-2xl ring-2 ring-red-300" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center gap-2 text-red-700"><Icon name="warn" size={22} /><h3 className="font-extrabold">تحذير — تجاوز الحد المسموح</h3></div>
      <div className="space-y-1.5 text-sm text-red-900">
        <p>الرصيد المتاح: <b>{sar(info.budget)}</b></p>
        <p>المستخدم حتى الآن: <b>{sar(info.used)}</b></p>
        <p>المطلوب صرفه: <b>{sar(info.adding)}</b></p>
        <p>الزيادة عن الرصيد: <b className="text-red-700">{sar(info.overage)}</b> ({info.pct_after.toFixed(1)}% من الرصيد)</p>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-bold text-red-700">سبب التجاوز (مطلوب)</label>
        <textarea value={reason} onChange={e => onReasonChange(e.target.value)} className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm" rows={2} placeholder="اكتب سبب التجاوز…" />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100">رجوع للتعديل</button>
        <button type="button" onClick={onConfirm} className="rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800">اعتماد رغم التجاوز</button>
      </div>
    </div>
  </div>;
}
