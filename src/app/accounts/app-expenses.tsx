"use client";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { CATS, TYPE_LABEL, activeIn, type AppExpense } from "@/lib/app-expenses";
import { sar, Card, Pill } from "./kit";

const TYPE_CLS: Record<AppExpense["type"], string> = { fixed: "bg-sky-50 text-sky-700 ring-sky-200", temp: "bg-amber-50 text-amber-800 ring-amber-200", once: "bg-slate-100 text-slate-600 ring-slate-200" };
type Form = { id?: number; name: string; cat: string; amount: string; type: AppExpense["type"]; start: string; end: string; date: string; note: string };

/** Expenses kept in this app (not in Daftra) for forecasting and cash planning only — actual expenses come from Daftra. */
export function AppExpenses({ today, reload }: { today: string; reload: () => void }) {
  const toast = useToast();
  const month = today.slice(0, 7);
  const blank: Form = { name: "", cat: "مرتبات", amount: "", type: "fixed", start: month, end: month, date: today, note: "" };
  const [list, setList] = useState<AppExpense[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [view, setView] = useState<"month" | "all">("month");
  const load = useCallback(() => fetch("/api/admin/expenses", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setList(j.expenses)).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const changed = () => { void load(); reload(); };

  async function save() {
    if (!form) return;
    const r = await fetch("/api/admin/expenses", { method: form.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتحفظ", "success"); setForm(null); changed();
  }
  async function stop(e: AppExpense) {
    const from = window.prompt("وقّف المصروف ده ابتداءً من أنهي شهر؟ (مثال 2026-12)", month);
    if (!from) return;
    const r = await fetch("/api/admin/expenses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: e.id, stop: from }) });
    if (r.ok) { toast("اتوقف", "success"); changed(); } else toast("شهر غير صحيح", "error");
  }
  async function del(e: AppExpense) {
    if (!window.confirm(`حذف «${e.name}» نهائياً؟ هيتشال من كل الشهور اللي فاتت كمان.`)) return;
    const r = await fetch(`/api/admin/expenses?id=${e.id}`, { method: "DELETE" });
    if (r.ok) { toast("اتحذف", "success"); changed(); } else toast("تعذر الحذف", "error");
  }
  const edit = (e: AppExpense) => setForm({ id: e.id, name: e.name, cat: e.cat, amount: String(e.amount), type: e.type, start: e.start || month, end: e.end || month, date: e.date || today, note: e.note || "" });

  const rows = (list || []).filter(e => view === "all" || activeIn(e, month));
  const monthTotal = (list || []).filter(e => activeIn(e, month)).reduce((s, e) => s + e.amount, 0);
  const fixedTotal = (list || []).filter(e => e.type !== "once" && activeIn(e, month)).reduce((s, e) => s + e.amount, 0);
  const ending = (list || []).filter(e => e.type === "temp" && e.end && e.end >= month).sort((a, b) => (a.end || "").localeCompare(b.end || ""))[0];
  const period = (e: AppExpense) => e.type === "once" ? e.date : e.type === "temp" ? `${e.start} ← ${e.end}` : `من ${e.start}${e.stop ? ` · متوقف من ${e.stop}` : ""}`;
  const inp = "rounded-lg border border-[var(--border)] px-2.5 py-2 text-sm";

  return <Card title="مصروفات البرنامج" hint="مصروفات للتخطيط والتوقع بس — المصاريف الفعلية بتيجي من دفترة. الثابتة بتتحسب في السيولة ونقطة التعادل. لو المصروف متسجل في دفترة كمان، ما تضيفوش هنا عشان ما يتحسبش مرتين."
    right={<button type="button" onClick={() => setForm(blank)} className="flex items-center gap-1 rounded-full bg-[var(--navy)] px-3.5 py-1.5 text-xs font-bold text-white"><Icon name="new-visit" size={14} />إضافة مصروف</button>}>
    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-bold text-[var(--muted)]">مصروفات الشهر ده</div><div className="text-lg font-extrabold tabular-nums">{sar(monthTotal)}</div></div>
      <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-bold text-[var(--muted)]">منها ثابت ومؤقت كل شهر</div><div className="text-lg font-extrabold tabular-nums">{sar(fixedTotal)}</div></div>
      <div className="rounded-2xl bg-[var(--sky-light)] p-3 text-[12.5px] leading-5">{ending ? <>«{ending.name}» بيخلص في <b>{ending.end}</b> — بعده مصروفك الشهري هينزل <b>{sar(ending.amount)}</b>.</> : <span className="text-[var(--muted)]">مفيش مصروفات مؤقتة قربت تخلص.</span>}</div>
    </div>

    {form && <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border-2 border-[var(--sky-border)] bg-[var(--sky-light)] p-3 sm:grid-cols-6">
      <div className="col-span-2 flex flex-wrap gap-1 sm:col-span-6">{(Object.keys(TYPE_LABEL) as AppExpense["type"][]).map(t => <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${form.type === t ? "bg-[var(--navy)] text-white" : "bg-[var(--card)] ring-1 ring-[var(--border)]"}`}>{TYPE_LABEL[t]}</button>)}</div>
      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="البند (مثلاً: إيجار المكتب)" aria-label="البند" className={`col-span-2 ${inp}`} />
      <select value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })} aria-label="التصنيف" className={inp}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
      <input inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder={form.type === "once" ? "المبلغ" : "المبلغ في الشهر"} aria-label="المبلغ" className={inp} />
      {form.type === "once"
        ? <label className="col-span-2 text-[11px] font-bold text-[var(--muted)]">التاريخ<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={`mt-0.5 w-full ${inp}`} /></label>
        : <><label className="text-[11px] font-bold text-[var(--muted)]">من شهر<input type="month" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} className={`mt-0.5 w-full ${inp}`} /></label>
          {form.type === "temp" ? <label className="text-[11px] font-bold text-[var(--muted)]">لحد شهر<input type="month" value={form.end} min={form.start} onChange={e => setForm({ ...form, end: e.target.value })} className={`mt-0.5 w-full ${inp}`} /></label> : <span />}</>}
      <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className={`col-span-2 sm:col-span-4 ${inp}`} />
      <div className="col-span-2 flex gap-2"><button type="button" onClick={() => void save()} className="rounded-full bg-[var(--navy)] px-5 py-2 text-xs font-bold text-white">حفظ</button><button type="button" onClick={() => setForm(null)} className="rounded-full px-4 py-2 text-xs font-bold">إلغاء</button></div>
    </div>}

    <div className="mb-2 flex gap-1 rounded-xl bg-[var(--bg)] p-1 text-xs font-bold">{([["month", "اللي عليا الشهر ده"], ["all", "كل البنود"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} className={`flex-1 rounded-lg px-3 py-1.5 ${view === k ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)]"}`}>{l}</button>)}</div>
    {list === null ? <div className="h-20 animate-pulse rounded-xl bg-[var(--bg)]" />
      : !rows.length ? <div className="py-6 text-center text-sm text-[var(--muted)]">{view === "month" ? "مفيش مصروفات على الشهر ده." : "لسه ما ضفتش مصروفات — ضيف المرتبات والإيجار عشان التوقعات والسيولة تطلع صح."}</div>
      : <div className="divide-y divide-[var(--border)]">{rows.map(e => <div key={e.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
        <div className="min-w-0 flex-1"><b>{e.name}</b> <span className="text-[11px] text-[var(--muted)]">· {e.cat} · {period(e)}{e.note ? ` · ${e.note}` : ""}</span></div>
        <Pill text={TYPE_LABEL[e.type]} cls={TYPE_CLS[e.type]} />
        <b className="w-28 text-left tabular-nums">{sar(e.amount)}</b>
        <span className="flex gap-0.5">
          <button type="button" onClick={() => edit(e)} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--navy)] hover:bg-[var(--bg)]">تعديل</button>
          {e.type === "fixed" && !e.stop && <button type="button" onClick={() => void stop(e)} className="rounded-lg px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50">إيقاف</button>}
          <button type="button" onClick={() => void del(e)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50">حذف</button>
        </span></div>)}</div>}
  </Card>;
}
