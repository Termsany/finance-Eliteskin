"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { reminderText, type Bucket, type PartyLine, type Row, type Status } from "@/lib/collections";
import { sar } from "./kit";
import { Tile } from "./summary";
import type { Open } from "./AccountsHub";

type Kind = "client" | "supplier";
type Data = { kind: Kind; today: string; current: string; sel: string; label: string; done: number | null; buckets: Bucket[]; parties: PartyLine[];
  totals: { open: number; overdue: number; selected: number; selected_overdue: number; selected_due: number; parties_selected: number; by_end: number } };
type Sort = "selected" | "total" | "oldest";

const ST: Record<Status, string> = { overdue: "bg-red-50 text-red-700", week: "bg-amber-50 text-amber-800", month: "bg-emerald-50 text-emerald-700" };
const stLabel = (r: Row) => r.status === "overdue" ? `متأخرة ${r.days} يوم` : r.days === 0 ? "تستحق النهارده" : `بعد ${-r.days} ${-r.days === 1 ? "يوم" : "أيام"}`;
const short = (b: Bucket) => b.key === "later" ? b.label : b.label.split(" ")[0];
const n = (x: number) => Math.round(x).toLocaleString("en-US");

/** Month by month: the current month carries everything overdue (marked as such), later months only their own dues. */
export function Collections({ subdomain, open, ask }: { today: string; subdomain: string; open: Open; ask: (q: string) => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("client");
  const [sel, setSel] = useState<string>("");
  const [sort, setSort] = useState<Sort>("selected");
  const [all, setAll] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [withInv, setWithInv] = useState(false);
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const j = await fetch(`/api/admin/finance/collections?kind=${kind}${sel ? `&sel=${sel}` : ""}`, { cache: "no-store" }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (j?.totals) setD(j); else toast(j?.error || "تعذر تحميل التحصيل", "error");
  }, [kind, sel, toast]);
  useEffect(() => { void load(); }, [load]);

  const isC = kind === "client", who = isC ? "العميل" : "المورد";
  const rows = useMemo(() => {
    const list = (d?.parties || []).filter(p => all || p.selected > 0);
    return [...list].sort((a, b) => sort === "total" ? b.total - a.total : sort === "oldest" ? b.oldest - a.oldest || b.overdue - a.overdue : b.selected - a.selected || b.total - a.total);
  }, [d, all, sort]);
  const max = Math.max(1, ...(d?.buckets || []).map(b => b.amount));
  const url = (id: number) => `https://${subdomain}/owner/${isC ? "invoices" : "purchase_invoices"}/view/${id}`;
  const report = d ? `/report/collections?kind=${kind}&sel=${d.sel}&invoices=${withInv ? 1 : 0}${all ? "&all=1" : ""}` : "#";
  async function copy(p: PartyLine) { try { await navigator.clipboard.writeText(reminderText({ party: p.party, total: p.total, overdue: p.overdue, rows: p.rows })); toast("اتنسخت رسالة التذكير — الصقها في واتساب", "success"); } catch { toast("تعذر النسخ", "error"); } }
  const askPlan = () => d && ask(isC
    ? `رتّب لي تحصيل ${d.label}: المطلوب فيه ${Math.round(d.totals.selected)} ريال من ${d.totals.parties_selected} عميل، منه ${Math.round(d.totals.selected_overdue)} متأخر. مين أكلمه الأول وأقول له إيه؟`
    : `عندي ${Math.round(d.totals.selected)} ريال لازم أدفعها للموردين في ${d.label}، منها ${Math.round(d.totals.selected_overdue)} متأخر. رتّب لي الدفع حسب الأولوية والسيولة.`);
  const seg = (on: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold transition ${on ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`;
  const bar = (b: Bucket) => b.key === "later" ? "bg-slate-400" : b.key === d?.current ? "bg-amber-500" : "bg-[var(--sky)]";
  const isCur = d?.sel === d?.current;

  return <div className="space-y-4">
    {isC && <Promises open={open} />}
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
        <button type="button" onClick={() => { setKind("client"); setOpenRow(null); }} className={seg(isC)}>مطلوب أحصّله من العملاء</button>
        <button type="button" onClick={() => { setKind("supplier"); setOpenRow(null); }} className={seg(!isC)}>مطلوب أدفعه للموردين</button>
      </div>
      <span className="mr-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={askPlan} disabled={!d} className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs font-bold text-[var(--navy)]"><Icon name="sparkle" size={14} />{isC ? "رتّب لي التحصيل" : "رتّب لي الدفع"}</button>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]"><input type="checkbox" checked={withInv} onChange={e => setWithInv(e.target.checked)} />الفواتير في التقرير</label>
        <a href={report} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white"><Icon name="file" size={14} />تقرير PDF</a>
      </span>
    </div>

    {!d ? <div className="h-48 animate-pulse rounded-[22px] bg-[var(--card)]" /> : <div className={`space-y-4 transition-opacity ${busy ? "opacity-50" : ""}`}>
      {/* months: each one only what falls due in it; tap to open */}
      <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <b className="text-[15px] text-[var(--ink)]">{isC ? "المطلوب تحصيله شهر بشهر" : "المطلوب دفعه شهر بشهر"}</b>
          <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)]"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />المتأخر محسوب على الشهر ده · كل شهر بعده عليه اللي ميعاده فيه بس · اضغط على أي شهر</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{d.buckets.map(b => { const on = b.key === d.sel;
          return <button key={b.key} type="button" onClick={() => { setSel(b.key); setOpenRow(null); }} aria-pressed={on}
            className={`group flex flex-col items-stretch rounded-2xl border p-2 text-center transition ${on ? "border-[var(--navy)] bg-[var(--sky-light)] ring-2 ring-[var(--navy)]/15" : "border-[var(--border)] hover:border-[var(--sky-border)]"}`}>
            <span className="flex h-16 items-end justify-center"><span className={`flex w-7 flex-col justify-end overflow-hidden rounded-t-md ${bar(b)} ${b.amount ? "" : "opacity-20"}`} style={{ height: `${Math.max(6, b.amount / max * 100)}%` }}>
              {b.overdue > 0 && <span className="w-full bg-red-500" style={{ height: `${b.overdue / b.amount * 100}%` }} />}</span></span>
            <span className="mt-1.5 text-[11.5px] font-bold text-[var(--ink)]">{short(b)}</span>
            <span className="text-[11px] font-extrabold tabular-nums text-[var(--ink)]">{b.amount ? n(b.amount) : "—"}</span>
            {b.overdue > 0 && <span className="text-[10px] font-bold tabular-nums text-red-700">منه {n(b.overdue)} متأخر</span>}
            <span className="text-[10px] text-[var(--muted)]">{b.parties ? `${b.parties} ${isC ? "عميل" : "مورد"}` : ""}</span>
          </button>; })}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={d.sel === "later" ? "بعد 6 شهور" : `${isC ? "مطلوب تحصيله" : "مطلوب دفعه"} في ${d.label}`} value={sar(d.totals.selected)}
          sub={isCur && d.totals.selected_overdue > 0 ? `منه ${sar(d.totals.selected_overdue)} متأخر + ${sar(d.totals.selected_due)} ميعاده الشهر ده` : `${d.totals.parties_selected} ${isC ? "عميل" : "مورد"}`} />
        <Tile label="منه متأخر — فات ميعاده" value={sar(d.totals.overdue)} tone={d.totals.overdue > 0 ? "bad" : undefined} onClick={() => { setSel(d.current); setSort("oldest"); }}
          sub={d.totals.overdue > 0 ? `محسوب على ${d.buckets[0].label.split(" ")[0]} · اضغط تشوفه` : "مفيش متأخرات 👍"} />
        <Tile label={d.sel === "later" ? "إجمالي المفتوح" : isCur ? `ميعاده في ${d.label.split(" ")[0]}` : `مطلوب لحد آخر ${d.label.split(" ")[0]}`}
          value={sar(d.sel === "later" ? d.totals.open : isCur ? d.totals.selected_due : d.totals.by_end)}
          sub={d.sel === "later" ? `على كل ${isC ? "العملاء" : "الموردين"}` : isCur ? "من غير المتأخر" : "الشهر ده (بالمتأخر) + الشهور لحد الشهر ده"} />
        {isC ? <Tile label="اتحصّل الشهر ده" value={d.done === null ? "—" : sar(d.done)} tone="good" sub="دفعات العملاء في دفترة" />
          : <Tile label="إجمالي المفتوح" value={sar(d.totals.open)} sub="دفعات الموردين مش بتتسحب من دفترة" />}
      </div>

      <div className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <b className="text-[15px]">{isC ? "العملاء" : "الموردين"} — {d.label}</b>
          <span className="mr-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />كل {isC ? "العملاء" : "الموردين"} اللي عليهم فلوس</label>
            <span className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">{([["selected", "مبلغ الشهر"], ["total", "الإجمالي"], ["oldest", "الأقدم تأخير"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setSort(k)} className={seg(sort === k)}>{l}</button>)}</span>
          </span>
        </div>
        {!rows.length ? <div className="p-8 text-center text-sm text-[var(--muted)]">مفيش {isC ? "عملاء" : "موردين"} عليهم فلوس في {d.label} 🎉</div> : <>
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_110px_110px_110px] gap-3 bg-[var(--sky-light)] px-5 py-2 text-[11px] font-bold text-[var(--muted)] md:grid">
            <span>{who}</span><span className="text-left">{`مطلوب في ${short(d.buckets.find(b => b.key === d.sel)!)}`}</span><span className="text-left">{isCur ? "منه متأخر" : "متأخر (على الشهر ده)"}</span><span className="text-left">بعد كده</span><span className="text-left">إجمالي اللي عليه</span>
          </div>
          <div className="divide-y divide-[var(--border)]">{rows.map(p => { const on = openRow === p.party;
            return <div key={p.party}>
              <button type="button" onClick={() => setOpenRow(on ? null : p.party)} aria-expanded={on} className="grid w-full grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-3 text-right transition hover:bg-[var(--sky-light)] sm:px-5 md:grid-cols-[minmax(0,1fr)_110px_110px_110px_110px]">
                <span className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.overdue > 0 ? "bg-red-600" : "bg-emerald-600"}`} />
                  <span className="min-w-0"><b className="block truncate text-[14px] text-[var(--ink)]">{p.party}</b>
                    <span className="text-[11px] text-[var(--muted)]">{p.overdue > 0 ? `أقدم تأخير ${p.oldest} يوم` : p.next_due ? `أول استحقاق ${p.next_due}` : ""} · {p.rows.length} فاتورة</span></span></span>
                <span className="text-left"><span className="text-[10px] text-[var(--muted)] md:hidden">الشهر </span><b className="text-[15px] tabular-nums text-[var(--navy)]">{p.selected ? sar(p.selected) : "—"}</b></span>
                <span className="text-left"><span className="text-[10px] text-[var(--muted)] md:hidden">{isCur ? "منه متأخر " : "متأخر "}</span><span className={`tabular-nums ${p.overdue ? "font-bold text-red-700" : "text-[var(--muted)]"}`}>{p.overdue ? sar(p.overdue) : "—"}</span></span>
                <span className="text-left"><span className="text-[10px] text-[var(--muted)] md:hidden">بعد كده </span><span className="tabular-nums text-[var(--muted)]">{p.after ? sar(p.after) : "—"}</span></span>
                <span className="text-left"><span className="text-[10px] text-[var(--muted)] md:hidden">الإجمالي </span><b className="tabular-nums text-[var(--ink)]">{sar(p.total)}</b></span>
              </button>
              {on && <div className="bg-[var(--bg)] px-4 pb-3 pt-1 sm:px-5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => open(kind, p.party)} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">كشف حساب</button>
                  {isC && <button type="button" onClick={() => void copy(p)} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">رسالة واتساب</button>}
                </div>
                <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">{p.rows.map(r => <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[12.5px]">
                  <a href={url(r.id)} target="_blank" rel="noreferrer" className="w-16 font-bold text-[var(--navy)] hover:underline" dir="ltr">{r.no}</a>
                  <span className="text-[var(--muted)]">فاتورة {r.date}</span><span className="text-[var(--muted)]">استحقاق {r.due}</span>
                  <b className="mr-auto tabular-nums">{sar(r.unpaid)}</b><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ST[r.status]}`}>{stLabel(r)}</span>
                </div>)}</div>
              </div>}
            </div>; })}</div>
          <div className="grid grid-cols-2 gap-3 border-t-2 border-[var(--border)] bg-[var(--sky-light)] px-4 py-3 text-[13px] font-extrabold sm:px-5 md:grid-cols-[minmax(0,1fr)_110px_110px_110px_110px]">
            <span className="col-span-2 md:col-span-1">الإجمالي ({rows.length})</span>
            <span className="text-left tabular-nums text-[var(--navy)]">{sar(rows.reduce((s, p) => s + p.selected, 0))}</span>
            <span className="text-left tabular-nums text-red-700">{sar(rows.reduce((s, p) => s + p.overdue, 0))}</span>
            <span className="text-left tabular-nums">{sar(rows.reduce((s, p) => s + p.after, 0))}</span>
            <span className="text-left tabular-nums">{sar(rows.reduce((s, p) => s + p.total, 0))}</span>
          </div>
        </>}
      </div>
      <div className="text-[11px] text-[var(--muted)]">الشهور الجاية بتتحسب من الفواتير المتسجلة في دفترة بس · ميعاد الاستحقاق = تاريخ الفاتورة + مدة السداد · المبالغ شاملة الضريبة.</div>
    </div>}
  </div>;
}

type PaymentPromise = { id: number; customer: string; note: string; promise_date: string; promise_amount: number | null; status: string; overdue: boolean; source?: "owner" | "rep"; rep_name?: string };
/** Open payment promises: owner's own follow-ups + rep promises from الميدان. */
function Promises({ open }: { open: (kind: "client", name: string) => void }) {
  const toast = useToast();
  const [d, setD] = useState<{ today: string; promises: PaymentPromise[] } | null>(null);
  const load = useCallback(() => fetch("/api/admin/finance/followups?promises=1", { cache: "no-store" }).then(r => r.json()).then(setD).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  async function mark(id: number, status: string) { if (id < 0) return; const r = await fetch("/api/admin/finance/followups", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) }); if (r.ok) { toast(status === "kept" ? "تمام، اتسجل إنه دفع" : "اتسجل إنه ما دفعش", "success"); await load(); } }
  if (!d || !d.promises.length) return null;
  return <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
    <div className="mb-2 flex items-center gap-2"><Icon name="calendar" size={16} /><b className="text-[15px]">وعود الدفع ({d.promises.length})</b>
      <span className="text-[11.5px] text-[var(--muted)]">من متابعتك ومن المناديب في الميدان — اللي فات ميعاده بالأحمر</span></div>
    <div className="space-y-1.5">{d.promises.slice(0, 12).map(p => <div key={p.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13px] ${p.overdue ? "bg-red-50" : "bg-[var(--sky-light)]"}`}>
      <button type="button" onClick={() => open("client", p.customer)} className="font-bold text-[var(--navy)] hover:underline">{p.customer}</button>
      {p.source === "rep" && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{p.rep_name || "مندوب"}</span>}
      <span className={p.overdue ? "font-bold text-red-700" : "text-[var(--muted)]"}>وعد يدفع {p.promise_amount ? `${sar(p.promise_amount)} ` : ""}يوم {p.promise_date}{p.overdue ? " — فات" : ""}</span>
      {p.note && <span className="hidden text-[var(--muted)] sm:inline">· {p.note.slice(0, 50)}</span>}
      {p.source !== "rep" && <span className="mr-auto flex gap-1.5">
        <button type="button" onClick={() => void mark(p.id, "kept")} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">دفع ✓</button>
        <button type="button" onClick={() => void mark(p.id, "broken")} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-red-700 ring-1 ring-red-200">ما دفعش ✗</button>
      </span>}
    </div>)}</div>
  </div>;
}
