"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Card, Kpi, sar, num, C } from "./kit";

type SubTab = "samples" | "promo" | "reps" | "reports";
const SUB_TABS: Array<[SubTab, string, string]> = [["samples", "العينات", "samples"], ["promo", "الدعاية", "gift"], ["reps", "المناديب", "reps"], ["reports", "التقارير", "chart"]];

type RepBudget = { id: number; rep_id: number; month: string; prev_units: number; sample_budget: number; promo_budget: number; sample_pct: number; promo_pct: number; unit_cost: number; prev_sales: number };
type RepSummary = { id: number; name: string; product_id: number | null; product_name: string | null; active: boolean; budget: RepBudget; samples: { budget_units: number; used_units: number; used_cost: number }; promo: { budget_amount: number; used_amount: number } };
type SampleRec = { id: number; rep_id: number; month: string; dispensed_at: string; total_units: number; total_cost: number; over_budget: boolean; override_reason: string | null; notes: string };
type PromoRow = { id: number; rep_id: number; rep_name: string; month: string; expense_date: string; promo_type: string; other_desc: string; amount: number; place: string; doctors: string[]; attendees: number; notes: string; over_budget: boolean; override_reason: string | null };
type RepRow = { id: number; name: string; product_id: number | null; product_name: string | null; active: boolean; sample_pct: number | null; promo_pct: number | null };
type Product = { id: number; name: string; average_cost: number };

const PROMO_LABELS: Record<string, string> = { pms: "PMS", lunch: "دعوة غداء", rtd: "RTD", other: "أخرى" };
const months = () => { const d = new Date(); const list: string[] = []; for (let i = 0; i < 12; i++) { list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() - 1); } return list; };
const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export function SamplesTab() {
  const [sub, setSub] = useState<SubTab>("samples");
  return <div className="space-y-4">
    <div className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
      {SUB_TABS.map(([k, l, ic]) => <button key={k} type="button" onClick={() => setSub(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${sub === k ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`}><Icon name={ic} size={14} />{l}</button>)}
    </div>
    {sub === "samples" && <SamplesPanel />}
    {sub === "promo" && <PromoPanel />}
    {sub === "reps" && <RepsPanel />}
    {sub === "reports" && <ReportsPanel />}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   Samples panel — budget in UNITS, one product per rep
   ═══════════════════════════════════════════════════════════════ */
function SamplesPanel() {
  const toast = useToast();
  const [month, setMonth] = useState(curMonth);
  const [reps, setReps] = useState<RepSummary[]>([]);
  const [records, setRecords] = useState<SampleRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispensing, setDispensing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/samples?month=${month}`).then(r => r.json()).catch(() => null);
    if (j?.reps) { setReps(j.reps); setRecords(j.records || []); }
    setLoading(false);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const totalBudgetUnits = reps.reduce((s, r) => s + r.samples.budget_units, 0);
  const totalUsedUnits = reps.reduce((s, r) => s + r.samples.used_units, 0);
  const totalUsedCost = reps.reduce((s, r) => s + r.samples.used_cost, 0);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <select value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
        {months().map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button type="button" onClick={() => setDispensing(true)} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white"><Icon name="samples" size={14} />صرف عينات</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Kpi label="رصيد العينات (وحدات)" value={num(totalBudgetUnits)} icon="samples" color={C.violet} />
      <Kpi label="المستخدم (وحدات)" value={num(totalUsedUnits)} icon="wallet" color={totalUsedUnits > totalBudgetUnits ? C.red : C.teal} />
      <Kpi label="المتبقي (وحدات)" value={num(totalBudgetUnits - totalUsedUnits)} icon="check" color={totalBudgetUnits - totalUsedUnits < 0 ? C.red : C.green} />
      <Kpi label="تكلفة المصروف" value={sar(totalUsedCost)} icon="wallet" color={C.amber} />
    </div>
    <Card title="رصيد كل مندوب">
      {loading ? <div className="h-20 animate-pulse rounded-xl bg-[var(--bg)]" /> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
            <th className="pb-2 text-right font-bold">المندوب</th>
            <th className="pb-2 text-right font-bold">الصنف</th>
            <th className="pb-2 text-right font-bold">مبيعات سابقة</th>
            <th className="pb-2 text-right font-bold">النسبة</th>
            <th className="pb-2 text-right font-bold">الرصيد</th>
            <th className="pb-2 text-right font-bold">المستخدم</th>
            <th className="pb-2 text-right font-bold">المتبقي</th>
            <th className="pb-2 text-right font-bold">الاستخدام</th>
          </tr></thead>
          <tbody>{reps.map(r => {
            const rem = r.samples.budget_units - r.samples.used_units;
            const pct = r.samples.budget_units > 0 ? r.samples.used_units / r.samples.budget_units * 100 : 0;
            return <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
              <td className="py-2 font-bold">{r.name}</td>
              <td className="py-2 text-xs text-[var(--muted)]">{r.product_name || "—"}</td>
              <td className="py-2 text-xs">{num(r.budget.prev_units)} وحدة</td>
              <td className="py-2 text-xs">{r.budget.sample_pct}%</td>
              <td className="py-2 text-xs font-bold">{num(r.samples.budget_units)}</td>
              <td className="py-2 text-xs">{num(r.samples.used_units)}</td>
              <td className={`py-2 text-xs font-bold ${rem < 0 ? "text-red-600" : ""}`}>{num(rem)}</td>
              <td className="py-2"><BudgetBar pct={pct} /></td>
            </tr>;
          })}</tbody>
        </table></div>}
      {reps.length === 0 && !loading && <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش مناديب. اضف مناديب من تبويب «المناديب» الأول.</p>}
    </Card>
    <Card title="سجل الصرف">
      {records.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش سجلات صرف بعد.</p>}
      {records.map(r => {
        const repName = reps.find(x => x.id === r.rep_id)?.name || `#${r.rep_id}`;
        return <div key={r.id} className={`mb-2 rounded-xl border p-3 text-sm ${r.over_budget ? "border-red-200 bg-red-50" : "border-[var(--border)]"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">{repName}</span>
            <span className="text-xs text-[var(--muted)]">{r.dispensed_at.slice(0, 10)}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className="font-bold">{num(r.total_units)} وحدة</span>
            <span className="text-[var(--muted)]">تكلفة: {sar(r.total_cost)}</span>
            {r.over_budget && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">تجاوز</span>}
          </div>
          {r.override_reason && <p className="mt-1 text-xs text-red-700">السبب: {r.override_reason}</p>}
          {r.notes && <p className="mt-1 text-xs text-[var(--muted)]">{r.notes}</p>}
        </div>;
      })}
    </Card>
    {dispensing && <DispenseForm reps={reps} onClose={() => setDispensing(false)} onSave={async () => { setDispensing(false); await load(); toast("تم صرف العينات", "success"); }} />}
  </div>;
}

function BudgetBar({ pct }: { pct: number }) {
  const color = pct > 100 ? C.red : pct > 80 ? C.amber : C.green;
  return <div className="flex items-center gap-2">
    <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>
    <span className="text-[10px] font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
  </div>;
}

function DispenseForm({ reps, onClose, onSave }: { reps: RepSummary[]; onClose: () => void; onSave: () => void }) {
  const toast = useToast();
  const [repId, setRepId] = useState<number | null>(null);
  const [units, setUnits] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [overBudgetInfo, setOverBudgetInfo] = useState<{ budget: number; used: number; requested: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const rep = reps.find(r => r.id === repId);
  const qty = Number(units) || 0;
  const afterUsage = (rep?.samples.used_units ?? 0) + qty;
  const isOver = rep ? afterUsage > rep.samples.budget_units : false;
  const cost = qty * (rep?.budget.unit_cost ?? 0);

  async function submit(reason?: string) {
    if (!repId || qty <= 0) { toast("اختار مندوب وحدد الكمية", "error"); return; }
    setSaving(true);
    const r = await fetch("/api/admin/samples", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ rep_id: repId, units: qty, notes, override_reason: reason }),
    });
    const j = await r.json().catch(() => null);
    setSaving(false);
    if (!r.ok && j?.over_budget) { setOverBudgetInfo({ budget: j.budget, used: j.used, requested: j.requested }); return; }
    if (!r.ok) { toast(j?.error || "حصل خطأ", "error"); return; }
    onSave();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-md rounded-2xl bg-[var(--card)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
      <h3 className="mb-4 font-extrabold text-[var(--navy)]">صرف عينات</h3>
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">المندوب</label>
          <select value={repId ?? ""} onChange={e => setRepId(Number(e.target.value) || null)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">اختار المندوب</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name} — {r.product_name || "بدون صنف"}</option>)}
          </select>
        </div>
        {rep && <div className={`rounded-xl p-3 text-xs ${isOver ? "bg-red-50 ring-1 ring-red-200" : "bg-[var(--sky-light)]"}`}>
          <p className="font-bold">{rep.product_name}</p>
          <div className="mt-1 flex justify-between gap-2">
            <span>الرصيد: <b>{num(rep.samples.budget_units)}</b> وحدة</span>
            <span>المستخدم: <b>{num(rep.samples.used_units)}</b></span>
            <span>بعد الصرف: <b className={isOver ? "text-red-700" : ""}>{num(afterUsage)}</b></span>
          </div>
          <BudgetBar pct={rep.samples.budget_units > 0 ? afterUsage / rep.samples.budget_units * 100 : 0} />
        </div>}
        <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">عدد الوحدات</label>
          <input type="number" value={units} onChange={e => setUnits(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" min="0.1" step="1" placeholder="0" />
        </div>
        {qty > 0 && rep && <p className="text-xs text-[var(--muted)]">التكلفة التقديرية: <b>{sar(cost)}</b> ({num(qty)} × {sar(rep.budget.unit_cost)})</p>}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" rows={2} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--muted)]">إلغاء</button>
        <button type="button" disabled={saving || !repId || qty <= 0} onClick={() => void submit()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ…" : "اعتماد الصرف"}</button>
      </div>
    </div>
    {overBudgetInfo && <OverBudgetModal
      title="تجاوز رصيد العينات"
      lines={[
        `الرصيد المتاح: ${num(overBudgetInfo.budget)} وحدة`,
        `المستخدم حتى الآن: ${num(overBudgetInfo.used)} وحدة`,
        `المطلوب صرفه: ${num(overBudgetInfo.requested)} وحدة`,
        `الزيادة: ${num(overBudgetInfo.requested - (overBudgetInfo.budget - overBudgetInfo.used))} وحدة`,
      ]}
      reason={overrideReason} onReasonChange={setOverrideReason} onCancel={() => setOverBudgetInfo(null)}
      onConfirm={() => { if (!overrideReason.trim()) { toast("لازم تكتب سبب التجاوز", "error"); return; } setOverBudgetInfo(null); void submit(overrideReason); }} />}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   Promo panel — budget in SAR
   ═══════════════════════════════════════════════════════════════ */
function PromoPanel() {
  const toast = useToast();
  const [month, setMonth] = useState(curMonth);
  const [reps, setReps] = useState<RepSummary[]>([]);
  const [expenses, setExpenses] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sj, pj] = await Promise.all([
      fetch(`/api/admin/samples?month=${month}`).then(r => r.json()).catch(() => null),
      fetch(`/api/admin/promo?month=${month}`).then(r => r.json()).catch(() => null),
    ]);
    if (sj?.reps) setReps(sj.reps);
    if (pj?.expenses) setExpenses(pj.expenses);
    setLoading(false);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const totalBudget = reps.reduce((s, r) => s + r.promo.budget_amount, 0);
  const totalUsed = reps.reduce((s, r) => s + r.promo.used_amount, 0);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <select value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
        {months().map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-xl bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white"><Icon name="gift" size={14} />تسجيل مصروف دعائي</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi label="رصيد الدعاية" value={sar(totalBudget)} icon="gift" color={C.violet} />
      <Kpi label="المستخدم" value={sar(totalUsed)} icon="wallet" color={totalUsed > totalBudget ? C.red : C.teal} />
      <Kpi label="المتبقي" value={sar(totalBudget - totalUsed)} icon="check" color={totalBudget - totalUsed < 0 ? C.red : C.green} />
    </div>
    <Card title="رصيد كل مندوب">
      {loading ? <div className="h-20 animate-pulse rounded-xl bg-[var(--bg)]" /> :
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
            <th className="pb-2 text-right font-bold">المندوب</th>
            <th className="pb-2 text-right font-bold">الصنف</th>
            <th className="pb-2 text-right font-bold">النسبة</th>
            <th className="pb-2 text-right font-bold">الرصيد</th>
            <th className="pb-2 text-right font-bold">المستخدم</th>
            <th className="pb-2 text-right font-bold">المتبقي</th>
            <th className="pb-2 text-right font-bold">الاستخدام</th>
          </tr></thead>
          <tbody>{reps.map(r => {
            const rem = r.promo.budget_amount - r.promo.used_amount;
            const pct = r.promo.budget_amount > 0 ? r.promo.used_amount / r.promo.budget_amount * 100 : 0;
            return <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
              <td className="py-2 font-bold">{r.name}</td>
              <td className="py-2 text-xs text-[var(--muted)]">{r.product_name || "—"}</td>
              <td className="py-2 text-xs">{r.budget.promo_pct}%</td>
              <td className="py-2 text-xs font-bold">{sar(r.promo.budget_amount)}</td>
              <td className="py-2 text-xs">{sar(r.promo.used_amount)}</td>
              <td className={`py-2 text-xs font-bold ${rem < 0 ? "text-red-600" : ""}`}>{sar(rem)}</td>
              <td className="py-2"><BudgetBar pct={pct} /></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </Card>
    <Card title="سجل المصروفات">
      {expenses.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش مصروفات دعائية بعد.</p>}
      {expenses.map(e => <div key={e.id} className={`mb-2 rounded-xl border p-3 text-sm ${e.over_budget ? "border-red-200 bg-red-50" : "border-[var(--border)]"}`}>
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
    {adding && <PromoForm reps={reps} onClose={() => setAdding(false)} onSave={async () => { setAdding(false); await load(); toast("تم التسجيل", "success"); }} />}
  </div>;
}

function PromoForm({ reps, onClose, onSave }: { reps: RepSummary[]; onClose: () => void; onSave: () => void }) {
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
  const [overBudgetInfo, setOverBudgetInfo] = useState<{ budget: number; used: number; requested: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const rep = reps.find(r => r.id === repId);
  const amt = Number(amount) || 0;
  const afterUsage = (rep?.promo.used_amount ?? 0) + amt;
  const isOver = rep ? afterUsage > rep.promo.budget_amount : false;

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
    if (!r.ok && j?.over_budget) { setOverBudgetInfo({ budget: j.budget, used: j.used, requested: j.requested }); return; }
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
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        {rep && <div className={`rounded-xl p-3 text-xs ${isOver ? "bg-red-50 ring-1 ring-red-200" : "bg-[var(--sky-light)]"}`}>
          <div className="flex justify-between gap-2"><span>الرصيد: <b>{sar(rep.promo.budget_amount)}</b></span><span>المستخدم: <b>{sar(rep.promo.used_amount)}</b></span><span>بعد الصرف: <b className={isOver ? "text-red-700" : ""}>{sar(afterUsage)}</b></span></div>
          <BudgetBar pct={rep.promo.budget_amount > 0 ? afterUsage / rep.promo.budget_amount * 100 : 0} />
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">النوع</label>
            <select value={promoType} onChange={e => setPromoType(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              {Object.entries(PROMO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">التاريخ</label>
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></div>
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
          <div className="mb-1 flex flex-wrap gap-1">{doctors.map(d => <span key={d} className="flex items-center gap-1 rounded-lg bg-[var(--sky-light)] px-2 py-0.5 text-xs font-bold">{d}<button type="button" onClick={() => setDoctors(doctors.filter(x => x !== d))} className="text-red-500"><Icon name="x" size={10} /></button></span>)}</div>
          <input value={doctorInput} onChange={e => setDoctorInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && doctorInput.trim()) { e.preventDefault(); addDoctor(doctorInput); } }}
            placeholder="اكتب اسم الطبيب واضغط Enter" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">عدد الحضور</label>
            <input type="number" value={attendees} onChange={e => setAttendees(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" min="0" /></div>
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" rows={2} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--muted)]">إلغاء</button>
        <button type="button" disabled={saving || !repId || !amount} onClick={() => void submit()} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "جارٍ الحفظ…" : "اعتماد"}</button>
      </div>
    </div>
    {overBudgetInfo && <OverBudgetModal
      title="تجاوز رصيد الدعاية"
      lines={[
        `الرصيد المتاح: ${sar(overBudgetInfo.budget)}`,
        `المستخدم حتى الآن: ${sar(overBudgetInfo.used)}`,
        `المطلوب صرفه: ${sar(overBudgetInfo.requested)}`,
        `الزيادة: ${sar(overBudgetInfo.requested - (overBudgetInfo.budget - overBudgetInfo.used))}`,
      ]}
      reason={overrideReason} onReasonChange={setOverrideReason} onCancel={() => setOverBudgetInfo(null)}
      onConfirm={() => { if (!overrideReason.trim()) { toast("لازم تكتب سبب التجاوز", "error"); return; } setOverBudgetInfo(null); void submit(overrideReason); }} />}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   Reps management — product-based (not clients)
   ═══════════════════════════════════════════════════════════════ */
function RepsPanel() {
  const toast = useToast();
  const [reps, setReps] = useState<RepRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RepRow | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/admin/reps").then(r => r.json()).catch(() => null);
    if (j?.reps) { setReps(j.reps); setProducts(j.products || []); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <Card title="المناديب" right={<button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-xl bg-[var(--navy)] px-3 py-1.5 text-xs font-bold text-white"><Icon name="new-visit" size={14} />إضافة مندوب</button>}>
    {loading ? <div className="animate-pulse h-20 rounded-xl bg-[var(--bg)]" /> :
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
          <th className="pb-2 text-right font-bold">الاسم</th>
          <th className="pb-2 text-right font-bold">الصنف</th>
          <th className="pb-2 text-right font-bold">نسبة العينات</th>
          <th className="pb-2 text-right font-bold">نسبة الدعاية</th>
          <th className="pb-2 text-right font-bold">الحالة</th>
          <th className="pb-2" />
        </tr></thead>
        <tbody>{reps.map(r => <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
          <td className="py-2.5 font-bold">{r.name}</td>
          <td className="py-2.5 text-xs text-[var(--muted)]">{r.product_name || <span className="text-amber-600">لم يتم الربط</span>}</td>
          <td className="py-2.5 text-xs">{r.sample_pct != null ? `${r.sample_pct}%` : <span className="text-[var(--muted)]">عام</span>}</td>
          <td className="py-2.5 text-xs">{r.promo_pct != null ? `${r.promo_pct}%` : <span className="text-[var(--muted)]">عام</span>}</td>
          <td className="py-2.5"><span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${r.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.active ? "فعّال" : "معطّل"}</span></td>
          <td className="py-2.5"><button type="button" onClick={() => setEditing(r)} className="text-xs font-bold text-[var(--navy)] hover:underline">تعديل</button></td>
        </tr>)}</tbody>
      </table></div>}
    {reps.length === 0 && !loading && <p className="py-6 text-center text-sm text-[var(--muted)]">مفيش مناديب. اضغط «إضافة مندوب» عشان تبدأ.</p>}
    {(adding || editing) && <RepForm rep={editing} products={products} onClose={() => { setAdding(false); setEditing(null); }} onSave={async () => { setAdding(false); setEditing(null); await load(); toast("تم الحفظ", "success"); }} />}
  </Card>;
}

function RepForm({ rep, products, onClose, onSave }: { rep: RepRow | null; products: Product[]; onClose: () => void; onSave: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(rep?.name || "");
  const [active, setActive] = useState(rep?.active ?? true);
  const [productId, setProductId] = useState<number | "">(rep?.product_id ?? "");
  const [samplePct, setSamplePct] = useState<string>(rep?.sample_pct != null ? String(rep.sample_pct) : "");
  const [promoPct, setPromoPct] = useState<string>(rep?.promo_pct != null ? String(rep.promo_pct) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast("اسم المندوب مطلوب", "error"); return; }
    setSaving(true);
    const body = {
      name: name.trim(), active,
      product_id: productId || null,
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
    if (!rep || !confirm("حذف المندوب؟")) return;
    await fetch(`/api/admin/reps/${rep.id}`, { method: "DELETE" });
    onSave();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
    <div className="mx-4 w-full max-w-lg rounded-2xl bg-[var(--card)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
      <h3 className="mb-4 font-extrabold text-[var(--navy)]">{rep ? "تعديل المندوب" : "إضافة مندوب"}</h3>
      <div className="space-y-3">
        <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">اسم المندوب</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="مثلاً: أحمد" /></div>
        <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">الصنف (المنتج)</label>
          <select value={productId} onChange={e => setProductId(Number(e.target.value) || "")} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
            <option value="">اختار الصنف</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} — تكلفة: {sar(p.average_cost)}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">نسبة العينات %</label>
            <input type="number" value={samplePct} onChange={e => setSamplePct(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="عام" min="0" max="100" step="0.5" /></div>
          <div><label className="mb-1 block text-xs font-bold text-[var(--muted)]">نسبة الدعاية %</label>
            <input type="number" value={promoPct} onChange={e => setPromoPct(e.target.value)} className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="عام" min="0" max="100" step="0.5" /></div>
        </div>
        {rep && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> فعّال</label>}
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

/* ═══════════════════════════════════════════════════════════════
   Reports panel
   ═══════════════════════════════════════════════════════════════ */
function ReportsPanel() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [to, setTo] = useState(curMonth);
  const [data, setData] = useState<{ reps: Array<{ rep_id: number; rep_name: string; product_name: string; months: Array<{ month: string; sample_budget: number; sample_used: number; sample_cost: number; promo_budget: number; promo_used: number; overrides: number }> }> } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/admin/samples/report?from=${from}&to=${to}`).then(r => r.json()).catch(() => null);
    if (j?.reps) setData(j);
    setLoading(false);
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const allMonths = useMemo(() => {
    if (!data?.reps.length) return [];
    const set = new Set<string>();
    data.reps.forEach(r => r.months.forEach(m => set.add(m.month)));
    return [...set].sort();
  }, [data]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs font-bold text-[var(--muted)]">من</label>
      <select value={from} onChange={e => setFrom(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
        {months().map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <label className="text-xs font-bold text-[var(--muted)]">إلى</label>
      <select value={to} onChange={e => setTo(e.target.value)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
        {months().map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
    {loading && <div className="h-20 animate-pulse rounded-xl bg-[var(--bg)]" />}
    {data && !loading && <Card title="تقرير العينات والدعاية">
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
          <th className="pb-2 text-right font-bold" rowSpan={2}>المندوب</th>
          <th className="pb-2 text-right font-bold" rowSpan={2}>الصنف</th>
          {allMonths.map(m => <th key={m} colSpan={4} className="pb-1 text-center font-bold">{m}</th>)}
        </tr>
        <tr className="border-b border-[var(--border)] text-[10px] text-[var(--muted)]">
          {allMonths.map(m => <React.Fragment key={m}>
            <th className="pb-1 text-right">عينات (وحدات)</th>
            <th className="pb-1 text-right">تكلفة</th>
            <th className="pb-1 text-right">دعاية</th>
            <th className="pb-1 text-right">تجاوزات</th>
          </React.Fragment>)}
        </tr></thead>
        <tbody>{data.reps.map(r => <tr key={r.rep_id} className="border-b border-[var(--border)] last:border-0">
          <td className="py-2 font-bold">{r.rep_name}</td>
          <td className="py-2 text-[var(--muted)]">{r.product_name || "—"}</td>
          {allMonths.map(m => {
            const md = r.months.find(x => x.month === m);
            return md ? <React.Fragment key={m}>
              <td className="py-2">{num(md.sample_used)}/{num(md.sample_budget)}</td>
              <td className="py-2">{sar(md.sample_cost)}</td>
              <td className="py-2">{sar(md.promo_used)}/{sar(md.promo_budget)}</td>
              <td className="py-2">{md.overrides > 0 ? <span className="rounded bg-red-100 px-1 py-0.5 text-red-700">{md.overrides}</span> : "—"}</td>
            </React.Fragment> : <React.Fragment key={m}><td className="py-2">—</td><td className="py-2">—</td><td className="py-2">—</td><td className="py-2">—</td></React.Fragment>;
          })}
        </tr>)}</tbody>
      </table></div>
      {data.reps.length === 0 && <p className="py-4 text-center text-sm text-[var(--muted)]">مفيش بيانات في الفترة دي.</p>}
    </Card>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   Over-budget warning modal
   ═══════════════════════════════════════════════════════════════ */
function OverBudgetModal({ title, lines, reason, onReasonChange, onCancel, onConfirm }: {
  title: string; lines: string[]; reason: string; onReasonChange: (v: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onCancel}>
    <div className="mx-4 w-full max-w-sm rounded-2xl bg-red-50 p-5 shadow-2xl ring-2 ring-red-300" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center gap-2 text-red-700"><Icon name="warn" size={22} /><h3 className="font-extrabold">{title}</h3></div>
      <div className="space-y-1 text-sm text-red-900">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
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
