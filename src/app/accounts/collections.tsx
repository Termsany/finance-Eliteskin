"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { reminderText, type Group, type Row, type Status } from "@/lib/collections";
import { sar, MONTHS } from "./kit";
import { Tile } from "./summary";
import type { Open } from "./AccountsHub";

type Kind = "client" | "supplier";
type Data = { kind: Kind; month: string; today: string; end: string; week_end: string; current: boolean; done: number | null;
  totals: { required: number; overdue: number; week: number; month: number; due: number; parties: number; overdue_parties: number; invoices: number };
  rows: Row[]; groups: Group[] };
type Filter = "all" | "overdue" | "week" | "month";

const nextMonth = (m: string) => { let [y, mo] = m.split("-").map(Number); mo++; if (mo > 12) { mo = 1; y++; } return `${y}-${String(mo).padStart(2, "0")}`; };
const mName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const ST: Record<Status, string> = { overdue: "bg-red-50 text-red-700", week: "bg-amber-50 text-amber-800", month: "bg-emerald-50 text-emerald-700" };
const stLabel = (r: Row) => r.status === "overdue" ? `متأخرة ${r.days} يوم` : r.days === 0 ? "تستحق النهارده" : `بعد ${-r.days} ${-r.days === 1 ? "يوم" : "أيام"}`;

/** What has to come in (or go out) this month: overdue in red, due soon in amber, the rest on time — with a printable report. */
export function Collections({ today, subdomain, open, ask }: { today: string; subdomain: string; open: Open; ask: (q: string) => void }) {
  const toast = useToast();
  const thisMonth = today.slice(0, 7);
  const [kind, setKind] = useState<Kind>("client");
  const [month, setMonth] = useState(thisMonth);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"party" | "date">("party");
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const j = await fetch(`/api/admin/finance/collections?kind=${kind}&month=${month}`, { cache: "no-store" }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (j?.totals) setD(j); else toast(j?.error || "تعذر تحميل التحصيل", "error");
  }, [kind, month, toast]);
  useEffect(() => { void load(); }, [load]);

  const isC = kind === "client";
  const pass = useCallback((r: Row) => filter === "all" || r.status === filter, [filter]);
  const groups = useMemo(() => (d?.groups || []).map(g => ({ ...g, rows: g.rows.filter(pass) })).filter(g => g.rows.length), [d, pass]);
  const rows = useMemo(() => (d?.rows || []).filter(pass), [d, pass]);
  const count = (s?: Status) => (d?.rows || []).filter(r => !s || r.status === s).length;
  const url = (id: number) => `https://${subdomain}/owner/${isC ? "invoices" : "purchase_invoices"}/view/${id}`;
  const report = `/report/collections?kind=${kind}&month=${month}&filter=${filter}&view=${view}`;
  async function copy(g: Group) { try { await navigator.clipboard.writeText(reminderText(g)); toast("اتنسخت رسالة التذكير — الصقها في واتساب", "success"); } catch { toast("تعذر النسخ", "error"); } }
  const askPlan = () => d && ask(isC
    ? `رتّب لي تحصيل ${mName(month)}: المطلوب ${Math.round(d.totals.required)} ريال، منه ${Math.round(d.totals.overdue)} متأخر عند ${d.totals.overdue_parties} عميل. مين أكلمه الأول وأقول له إيه؟ وإيه اللي أعمله مع المتأخر أكتر من 60 يوم؟`
    : `عندي ${Math.round(d.totals.required)} ريال لازم أدفعها للموردين في ${mName(month)}، منها ${Math.round(d.totals.overdue)} متأخرة. رتّب لي الدفع حسب الأولوية والسيولة.`);

  const t = d?.totals;
  const progress = d && d.done !== null && d.done + d.totals.required > 0 ? d.done / (d.done + d.totals.required) * 100 : null;
  const seg = (on: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold transition ${on ? "bg-[var(--card)] text-[var(--navy)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--navy)]"}`;
  const chip = (on: boolean) => `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${on ? "bg-[var(--navy)] text-white" : "border border-[var(--border)] bg-[var(--card)] text-[var(--ink)] hover:border-[var(--sky-border)]"}`;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
        <button type="button" onClick={() => setKind("client")} className={seg(isC)}>مطلوب أحصّله من العملاء</button>
        <button type="button" onClick={() => setKind("supplier")} className={seg(!isC)}>مطلوب أدفعه للموردين</button>
      </div>
      <div className="flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
        <button type="button" onClick={() => setMonth(thisMonth)} className={seg(month === thisMonth)}>{mName(thisMonth)}</button>
        <button type="button" onClick={() => setMonth(nextMonth(thisMonth))} className={seg(month === nextMonth(thisMonth))}>الشهر الجاي</button>
      </div>
      <span className="mr-auto flex flex-wrap gap-2">
        <button type="button" onClick={askPlan} disabled={!d} className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs font-bold text-[var(--navy)]"><Icon name="sparkle" size={14} />{isC ? "رتّب لي التحصيل" : "رتّب لي الدفع"}</button>
        <a href={report} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white"><Icon name="file" size={14} />تقرير PDF</a>
      </span>
    </div>

    {!d || !t ? <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-[var(--card)]" />)}</div> : <div className={`space-y-4 transition-opacity ${busy ? "opacity-50" : ""}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`${isC ? "المطلوب تحصيله" : "المطلوب دفعه"} — ${mName(month)}`} value={sar(t.required)} sub={`المتأخر + المستحق لحد ${d.end}`} />
        <Tile label="متأخر — فات ميعاده" value={sar(t.overdue)} tone={t.overdue > 0 ? "bad" : undefined} onClick={() => setFilter("overdue")}
          sub={t.overdue > 0 ? <span className="text-red-700">عند {t.overdue_parties} {isC ? "عميل" : "مورد"} · أقدم {Math.max(0, ...d.groups.map(g => g.oldest))} يوم</span> : "مفيش متأخرات 👍"} />
        <Tile label={d.current ? "مستحق باقي الشهر" : `مستحق في ${mName(month)}`} value={sar(t.due)} onClick={() => setFilter("month")}
          sub={d.current && t.week > 0 ? <span className="text-amber-700">منها {sar(t.week)} الأسبوع ده</span> : "في ميعاده"} />
        {isC ? <Tile label={d.current ? "اتحصّل فعلاً الشهر ده" : "اتحصّل في الشهر"} value={d.done === null ? "—" : sar(d.done)} tone="good"
          sub={progress !== null ? `${Math.round(progress)}% من المطلوب` : "الشهر لسه ما بدأش"} />
          : <Tile label="عدد الفواتير" value={String(t.invoices)} sub={`${t.parties} مورد`} hint="دفعات الموردين مش بتتسحب من دفترة، فالمدفوع مش ظاهر هنا." />}
      </div>

      {progress !== null && <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] font-semibold text-[var(--muted)]">
          <span>اتحصّل {sar(d.done)} من {sar(d.done! + t.required)}</span>
          <span className="flex gap-3 text-[11px]"><i className="flex items-center gap-1 not-italic"><b className="h-2 w-2 rounded-full bg-emerald-600" />اتحصّل</i><i className="flex items-center gap-1 not-italic"><b className="h-2 w-2 rounded-full bg-amber-500" />في ميعاده</i><i className="flex items-center gap-1 not-italic"><b className="h-2 w-2 rounded-full bg-red-600" />متأخر</i></span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--bg)]">{[[d.done!, "bg-emerald-600"], [t.due, "bg-amber-500"], [t.overdue, "bg-red-600"]].map(([v, c], i) => <span key={i} className={c as string} style={{ width: `${(v as number) / (d.done! + t.required) * 100}%` }} />)}</div>
      </div>}

      <div className="flex flex-wrap items-center gap-1.5">
        {([["all", "الكل", count(), null], ["overdue", "المتأخر بس", count("overdue"), "bg-red-600"], ["week", d.current ? "الأسبوع ده" : "أول أسبوع", count("week"), "bg-amber-500"], ["month", "باقي الشهر", count("month"), "bg-emerald-600"]] as const).map(([k, l, n, dot]) =>
          <button key={k} type="button" onClick={() => setFilter(k)} className={chip(filter === k)}>{dot && <b className={`h-2 w-2 rounded-full ${dot}`} />}{l} ({n})</button>)}
        <div className="mr-auto flex gap-1 rounded-xl bg-[var(--sky-light)] p-1">
          <button type="button" onClick={() => setView("party")} className={seg(view === "party")}>حسب {isC ? "العميل" : "المورد"}</button>
          <button type="button" onClick={() => setView("date")} className={seg(view === "date")}>بالتاريخ</button>
        </div>
      </div>

      {!rows.length ? <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted)]">{filter === "all" ? `مفيش مبالغ ${isC ? "مطلوب تحصيلها" : "مطلوب دفعها"} في ${mName(month)} 🎉` : "مفيش فواتير في الفلتر ده"}</div>
        : view === "party" ? <div className="space-y-3">{groups.map(g => { const sum = g.rows.reduce((s, r) => s + r.unpaid, 0), late = g.rows.some(r => r.status === "overdue"); return <div key={g.party} className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${late ? "bg-red-600" : "bg-amber-500"}`} />
            <button type="button" onClick={() => open(kind, g.party)} className="min-w-0 text-right text-[15px] font-extrabold text-[var(--ink)] hover:text-[var(--navy)] hover:underline">{g.party}</button>
            <span className="text-right"><b className="block text-[18px] font-extrabold tabular-nums">{sar(sum)}</b>
              <span className={`text-[11.5px] font-semibold ${late ? "text-red-700" : "text-amber-700"}`}>{late ? `${sar(g.rows.filter(r => r.status === "overdue").reduce((s, r) => s + r.unpaid, 0))} متأخر · أقدم ${g.oldest} يوم` : `في الميعاد · أول استحقاق ${g.next_due}`}</span></span>
            <span className="mr-auto flex gap-1.5">
              <button type="button" onClick={() => open(kind, g.party)} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">كشف حساب</button>
              {isC && <button type="button" onClick={() => void copy({ ...g, total: sum })} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">واتساب</button>}
            </span>
          </div>
          <div className="divide-y divide-[var(--border)]">{g.rows.map(r => <Line key={r.id} r={r} url={url(r.id)} />)}</div>
        </div>; })}</div>
        : <div className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)]"><div className="divide-y divide-[var(--border)]">{rows.map(r => <Line key={r.id} r={r} url={url(r.id)} party={r.party} onParty={() => open(kind, r.party)} />)}</div></div>}
      <div className="text-[11px] text-[var(--muted)]">ميعاد الاستحقاق = تاريخ الفاتورة + مدة السداد المسجلة عليها في دفترة. المبالغ شاملة الضريبة.</div>
    </div>}
  </div>;
}

function Line({ r, url, party, onParty }: { r: Row; url: string; party?: string; onParty?: () => void }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[12.5px] sm:px-5">
    {party && <button type="button" onClick={onParty} className="w-full truncate text-right font-bold text-[var(--ink)] hover:underline sm:w-56">{party}</button>}
    <a href={url} target="_blank" rel="noreferrer" className="w-16 font-bold text-[var(--navy)] hover:underline" dir="ltr">{r.no}</a>
    <span className="text-[var(--muted)]">فاتورة {r.date}</span>
    <span className="text-[var(--muted)]">استحقاق {r.due}</span>
    <b className="mr-auto tabular-nums">{sar(r.unpaid)}</b>
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ST[r.status]}`}>{stLabel(r)}</span>
  </div>;
}
