"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { cashPlan, planRows, manualFinance, type PlanInputs, type PlanOpts } from "@/lib/cash-plan";
import { monthLabel } from "@/lib/collections";
import { sar, short, Card, Hint } from "./kit";

type Approved = { approved_at: string; target_sales: number; financing: number; term: number; installment: number; rate: number; grace: number; start: string | null } | null;

/** «خطة الخروج من أزمة السيولة»: the gap, the sales needed without financing, and the smallest financing per term. */
export function CashPlan() {
  const toast = useToast();
  const [inp, setInp] = useState<PlanInputs | null>(null);
  const [approved, setApproved] = useState<Approved>(null);
  const [o, setO] = useState<PlanOpts | null>(null);
  const [term, setTerm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<Set<string>>(new Set());   // which plan products are included in the cost ratio
  useEffect(() => {
    fetch("/api/admin/finance/plan", { cache: "no-store" }).then(r => r.json()).then(j => {
      if (!j?.inputs) return; const p: PlanInputs = j.inputs;
      setInp(p); setApproved(j.approved); setPicks(new Set(p.products.map(x => x.key)));
      setO({ sales: Math.round(p.base.sales / 1000) * 1000, collect: 0.9, cut: 0, deferAp: 0, lagIn: p.lag_in, buffer: 0, rate: 10, grace: 0, cogsRatio: p.plan_cogs_ratio, financing: null });
    }).catch(() => {});
  }, []);
  const plan = useMemo(() => inp && o ? cashPlan(inp, o) : null, [inp, o]);
  const sel = plan ? plan.terms.find(t => t.n === (term ?? plan.suggestion?.n ?? plan.recommended)) || null : null;
  const autoFin = sel && sel.needed && sel.feasible ? sel : null;
  const manual = useMemo(() => inp && o && o.financing ? manualFinance(inp, o, o.sales, o.financing.F, o.financing.n) : null, [inp, o]);
  const useFin = manual ?? autoFin;
  const rows = useMemo(() => inp && o ? planRows(inp, o, o.sales, useFin ? { F: useFin.F, n: useFin.n, f0: useFin.f0 } : null, useFin ? useFin.H : 12) : null, [inp, o, useFin]);
  if (!inp || !o || !plan) return <div className="h-40 animate-pulse rounded-2xl bg-[var(--card)]" />;
  const set = (k: keyof PlanOpts, v: number) => setO({ ...o, [k]: v });
  const apply = (sales: number, n: number) => { setO({ ...o, sales, financing: null }); setTerm(n); };
  const ratioFrom = (keys: Set<string>) => {
    const sel2 = inp.products.filter(x => keys.has(x.key)); if (!sel2.length) return o.cogsRatio;
    const w = sel2.reduce((a, x) => a + x.qty_sold * x.price, 0);
    return Math.round((w > 0 ? sel2.reduce((a, x) => a + x.cost_ratio * x.qty_sold * x.price, 0) / w : sel2.reduce((a, x) => a + x.cost_ratio, 0) / sel2.length) * 1000) / 1000;
  };
  const togglePick = (key: string) => { const n = new Set(picks); if (n.has(key)) n.delete(key); else n.add(key); setPicks(n); setO({ ...o, cogsRatio: ratioFrom(n) }); };
  const cogsOfGoods = Math.round(o.sales * o.cogsRatio);
  const sg = plan.suggestion;
  const q = new URLSearchParams({ sales: String(o.sales), collect: String(Math.round(o.collect * 100)), cut: String(o.cut), defer: String(o.deferAp), lag: String(o.lagIn), buffer: String(o.buffer), rate: String(o.rate), grace: String(o.grace), cogs: String(Math.round(o.cogsRatio * 100)), term: String(sel?.n || ""), ...(o.financing ? { fin: String(o.financing.F), finN: String(o.financing.n) } : {}) });
  const monthOpex = Math.round(inp.base.opex);

  async function approve() {
    if (!o) return;
    setBusy(true);
    const s = useFin;
    const target = o.financing ? o.sales : Math.max(o.sales, (autoFin?.carry_sales) || plan?.no_finance.sales || 0);
    const r = await fetch("/api/admin/finance/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      target_sales: target, financing: s?.F || 0, term: s?.n || 0, installment: s?.installment || 0, rate: o.rate, grace: o.grace, start: s?.start, collect: o.collect }) });
    const j = await r.json().catch(() => null); setBusy(false);
    if (r.ok) { setApproved(j.plan); toast(`اتعتمدت الخطة — هدف الشهر بقى ${Math.round(target).toLocaleString("en-US")} ر.س`, "success"); } else toast(j?.error || "تعذر الحفظ", "error");
  }

  const ctl = (label: string, el: React.ReactNode, hint?: string) => <label className="block"><span className="flex items-center text-[11.5px] font-bold text-[var(--muted)]">{label}{hint && <Hint text={hint} />}</span><div className="mt-1">{el}</div></label>;
  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold";
  const balMax = Math.max(1, ...(rows || []).map(r => Math.abs(r.balance)));

  return <Card title="خطة الخروج من أزمة السيولة" hint="نموذج شهر بشهر لـ 12 شهر أو أكتر (لحد آخر قسط): التحصيل، الموردين، المصاريف، الضريبة، المبيعات الجديدة، والتمويل. حرّك أي رقم والخطة تتحسب فوراً.">
    {/* diagnosis */}
    {plan.needs_help ? <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-[13px] leading-6 text-red-900">
      <span className="text-red-600"><Icon name="flag" size={20} /></span>
      <div><b className="block text-[14px]">عجز متوقع {sar(plan.gap)}</b>
        من غير أي تغيير، الرصيد هيبدأ ينزل تحت {o.buffer ? `الاحتياطي (${sar(o.buffer)})` : "الصفر"} في <b>{plan.first_short}</b> ويوصل لأقل حاجة <b>{sar(plan.lowest.balance)}</b> في {plan.lowest.label} — على أساس مبيعات {sar(o.sales)} شهرياً وتحصيل {Math.round(o.collect * 100)}% من الفواتير المفتوحة.</div>
    </div> : <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[13px] leading-6 text-emerald-950">
      <span className="text-emerald-700"><Icon name="check" size={20} /></span>
      <div><b className="block text-[14px]">مفيش عجز بالخطة دي</b>أقل رصيد متوقع {sar(plan.lowest.balance)} في {plan.lowest.label}. مش محتاج تمويل لو حافظت على مبيعات {sar(o.sales)} شهرياً.</div>
    </div>}
    {!inp.opening_as_of && <div className="mb-3 rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-900 ring-1 ring-amber-200">لسه ما كتبتش رصيد البنك والخزنة فوق — الحساب بيبدأ من صفر. اكتبه عشان الخطة تبقى دقيقة.</div>}

    {/* the suggested plan */}
    {sg && <div className="mb-4 rounded-2xl border-2 border-[var(--navy)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-[15px] text-[var(--navy)]">الخطة المقترحة — أقل تمويل يحل المشكلة</b>
        {(o.sales !== sg.sales || sel?.n !== sg.n) && <button type="button" onClick={() => apply(sg.sales, sg.n)} className="rounded-full bg-[var(--navy)] px-3.5 py-1.5 text-xs font-bold text-white">طبّق الخطة دي</button>}</div>
      {sg.raised && <p className="mt-1 text-[12.5px] text-amber-800">مبيعاتك الحالية ({sar(o.sales)} شهرياً) ما بتغطيش المصاريف، فمفيش تمويل ينفع يتسدد عليها. أقل مبيعات تخلّي التمويل يتسدد:</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["بيع شهرياً (قبل الضريبة)", sar(sg.sales)], ["تمويل", sar(sg.F)], [`قسط × ${sg.n} شهر`, sar(sg.installment)], ["تكلفة التمويل", sar(sg.cost)]] as Array<[string, string]>).map(([l, v]) =>
          <div key={l} className="rounded-xl bg-[var(--sky-light)] px-3 py-2"><div className="text-[11px] font-bold text-[var(--muted)]">{l}</div><div className="text-[17px] font-extrabold tabular-nums text-[var(--ink)]">{v}</div></div>)}
      </div>
      {plan.sustain_sales !== null && sg.sales < plan.sustain_sales && <p className="mt-2 text-[12px] font-bold text-amber-800">المبيعات دي تحت نقطة التعادل ({sar(plan.sustain_sales)}) — التمويل بيعدّي الأزمة، لكن الرصيد هيرجع ينزل بعدها لو المبيعات فضلت كده.</p>}
      <p className="mt-2 text-[12px] text-[var(--muted)]">استلام التمويل في {sg.start && monthLabel(sg.start)} · الأقساط من {sg.first_payment && monthLabel(sg.first_payment)} لـ {sg.last_payment && monthLabel(sg.last_payment)}{sg.carry_sales ? ` · بعد ما الأمور تستقر حافظ على مبيعات ${sar(sg.carry_sales)} شهرياً عشان تغطي المصاريف والقسط` : ""}.</p>
    </div>}

    {/* controls */}
    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--sky-light)] p-3 sm:grid-cols-4">
      {ctl("المبيعات الشهرية (قبل الضريبة)", <input value={o.sales} onChange={e => set("sales", Math.max(0, Number(e.target.value.replace(/,/g, "")) || 0))} inputMode="decimal" dir="ltr" className={inputCls} />, `متوسطك آخر ${inp.base.months || 12} شهر ${sar(inp.base.sales)}. غيّره عشان تشوف أثر بيع أكتر أو أقل من الشهر الجاي.`)}
      {ctl(`تحصيل الفواتير المفتوحة ${Math.round(o.collect * 100)}%`, <input type="range" min={50} max={100} value={Math.round(o.collect * 100)} onChange={e => set("collect", Number(e.target.value) / 100)} className="w-full accent-[var(--sky)]" />, "نسبة اللي هيتحصّل من الفواتير المفتوحة دلوقتي، مهما كان التأخير. المتأخر بيتحصّل نصه الشهر ده ونصه الشهر الجاي. المبيعات الجديدة بتتحصّل كاملة بعد مدة السداد.")}
      {ctl(`تخفيض المصاريف ${o.cut}%`, <input type="range" min={0} max={40} step={5} value={o.cut} onChange={e => set("cut", Number(e.target.value))} className="w-full accent-[var(--sky)]" />, `مصاريفك الشهرية ${sar(monthOpex)}.`)}
      {ctl("تأجيل الموردين المتأخرين", <select value={o.deferAp} onChange={e => set("deferAp", Number(e.target.value))} className={inputCls}>{[0, 1, 2, 3].map(v => <option key={v} value={v}>{v ? `${v} شهر` : "من غير تأجيل"}</option>)}</select>, "لو قدرت تتفق مع الموردين اللي فات ميعادهم تأجّل دفعهم.")}
      {ctl("نسبة الربح السنوية للتمويل %", <input value={o.rate} onChange={e => set("rate", Math.min(40, Math.max(0, Number(e.target.value) || 0)))} inputMode="decimal" dir="ltr" className={inputCls} />)}
      {ctl("فترة سماح قبل أول قسط", <select value={o.grace} onChange={e => set("grace", Number(e.target.value))} className={inputCls}>{[0, 1, 2, 3, 6].map(v => <option key={v} value={v}>{v ? `${v} شهر` : "من غير سماح"}</option>)}</select>)}
      {ctl("المبيعات بتتحصّل بعد", <select value={o.lagIn} onChange={e => set("lagIn", Number(e.target.value))} className={inputCls}>{[0, 1, 2, 3].map(v => <option key={v} value={v}>{v ? `${v} شهر` : "نفس الشهر"}</option>)}</select>, `من مدد السداد في فواتيرك: حوالي ${inp.lag_in} شهر.`)}
      {ctl("احتياطي أمان", <select value={o.buffer} onChange={e => set("buffer", Number(e.target.value))} className={inputCls}><option value={0}>من غير احتياطي (أقل تمويل)</option><option value={monthOpex}>مصاريف شهر ({short(monthOpex)})</option></select>, "أقل تمويل = الرصيد ما ينزلش تحت الصفر. الاحتياطي يخلّي فيه هامش أمان.")}
    </div>

    {/* cost of goods for the new sales — from the plan products */}
    <div className="mt-3 rounded-2xl border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[14px]">تكلفة شراء البضاعة للمبيعات الجديدة</b>
        <span className="text-[12px] text-[var(--muted)]">من كل {sar(o.sales)} مبيعات، تكلفة الشراء <b className="text-[var(--ink)]">{sar(cogsOfGoods)}</b> ({Math.round(o.cogsRatio * 100)}%) — دي بتبقى مدفوعات موردين بعد {inp.lag_out} شهر</span>
      </div>
      {inp.products.length > 0 ? <>
        <p className="mt-1 text-[12px] text-[var(--muted)]">الحساب على أصنافك: اختار اللي شغّال عليها والنسبة تتحسب من تكلفتها وسعر بيعها.</p>
        <div className="mt-2 flex flex-wrap gap-2">{inp.products.map(x => { const on = picks.has(x.key);
          return <button key={x.key} type="button" onClick={() => togglePick(x.key)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? "border-[var(--navy)] bg-[var(--sky-light)] text-[var(--navy)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
            {on ? "✓ " : ""}{x.name} <span className="font-normal">· تكلفة {Math.round(x.cost_ratio * 100)}%</span></button>; })}</div>
      </> : <p className="mt-1 text-[12px] text-amber-800">ما لقيتش أصناف الخطة (Arche · Spectra · Dermomine · gro) في بيانات دفترة — بستخدم متوسط تكلفتك العامة {Math.round(inp.base.cogs_ratio * 100)}%. تقدر تكتب النسبة بإيدك.</p>}
      <label className="mt-3 flex flex-wrap items-center gap-2 text-[12px]"><span className="font-bold text-[var(--muted)]">أو اكتب نسبة التكلفة %</span>
        <input value={Math.round(o.cogsRatio * 100)} onChange={e => set("cogsRatio", Math.min(98, Math.max(0, Number(e.target.value) || 0)) / 100)} inputMode="decimal" dir="ltr" className="w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-bold" /></label>
    </div>

    {/* manual financing — type your own amount and term */}
    <div className="mt-3 rounded-2xl border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[14px]">تمويل بمبلغ تكتبه بنفسك</b>
        {o.financing && <button type="button" onClick={() => setO({ ...o, financing: null })} className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--navy)]">رجّع لأقل تمويل تلقائي</button>}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-[11.5px] font-bold text-[var(--muted)]">المبلغ</span>
          <input value={o.financing?.F ?? ""} placeholder="اكتب مبلغ التمويل" onChange={e => { const F = Math.max(0, Number(e.target.value.replace(/,/g, "")) || 0); setO({ ...o, financing: F > 0 ? { F, n: o.financing?.n ?? 12 } : null }); }} inputMode="decimal" dir="ltr" className={inputCls} /></label>
        <label className="block"><span className="text-[11.5px] font-bold text-[var(--muted)]">مدة السداد</span>
          <select value={o.financing?.n ?? 12} onChange={e => o.financing && setO({ ...o, financing: { F: o.financing.F, n: Number(e.target.value) } })} disabled={!o.financing} className={inputCls}>{[6, 9, 12, 18, 24, 30, 36].map(v => <option key={v} value={v}>{v} شهر</option>)}</select></label>
      </div>
      {manual && <div className="mt-2 text-[12.5px] leading-6">
        <span className={manual.ok ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{manual.ok ? "✓ المبلغ ده بيكفّي" : "✗ المبلغ ده مش كفاية"}</span>
        {" "}— قسط <b>{sar(manual.installment)}</b> × {manual.n} شهر · تكلفة التمويل {sar(manual.cost)} · أقل رصيد متوقع <b className={manual.min_balance < o.buffer ? "text-red-700" : "text-[var(--navy)]"}>{sar(manual.min_balance)}</b>{!manual.ok && autoFin ? ` · أقل مبلغ يكفّي ${sar(autoFin.F)}` : ""}.
      </div>}
    </div>

    {/* without financing */}
    <div className="mt-4 rounded-2xl border border-[var(--border)] p-4">
      <div className="text-[14px] font-extrabold">١) من غير تمويل خالص</div>
      {plan.no_finance.possible
        ? <p className="mt-1 text-[13px] leading-6">محتاج تبيع <b className="text-[16px] text-[var(--navy)]">{sar(plan.no_finance.sales)}</b> شهرياً من الشهر الجاي (قبل الضريبة) عشان الرصيد ما ينزلش تحت {o.buffer ? "الاحتياطي" : "الصفر"} — مقابل متوسطك {sar(inp.base.sales)}.
          {(plan.no_finance.sales || 0) > inp.base.sales * 1.3 && <span className="block text-[12px] text-amber-800">ده أعلى من متوسطك بـ {Math.round(((plan.no_finance.sales || 0) / Math.max(1, inp.base.sales) - 1) * 100)}% — صعب غالباً، فالتمويل الصغير تحت أضمن.</span>}</p>
        : <p className="mt-1 text-[13px] leading-6 text-red-800">مش ممكن بالمبيعات لوحدها: العجز في <b>{plan.no_finance.blocked.slice(0, 2).map(monthLabel).join(" و ")}</b> جاي قبل ما فلوس أي مبيعات جديدة تتحصّل (التحصيل بعد {o.lagIn} شهر). الحل: تمويل صغير، أو تحصيل أسرع، أو تأجيل الموردين.</p>}
      {plan.sustain_sales !== null && <p className="mt-1 text-[12px] text-[var(--muted)]">عشان تغطي مصاريفك كل شهر على المدى الطويل محتاج مبيعات {sar(plan.sustain_sales)} شهرياً على الأقل (كل ريال مبيعات بيسيب {plan.unit_net} ريال كاش بعد التكلفة والضريبة).</p>}
    </div>

    {/* financing options */}
    {plan.needs_help && <div className="mt-4 rounded-2xl border border-[var(--border)] p-4">
      <div className="text-[14px] font-extrabold">٢) أقل تمويل لكل مدة سداد</div>
      <p className="mt-0.5 text-[12px] text-[var(--muted)]">أقل مبلغ يخلّي الرصيد فوق {o.buffer ? "الاحتياطي" : "الصفر"} طول الفترة لحد آخر قسط — على مبيعات {sar(o.sales)} شهرياً. اضغط على أي مدة عشان تشوف الخطة شهر بشهر.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-[13px]">
        <thead className="bg-[var(--sky-light)] text-[11px] text-[var(--muted)]"><tr><th className="p-2 text-right">المدة</th><th className="p-2">التمويل</th><th className="p-2">القسط الشهري</th><th className="p-2">تكلفة التمويل</th><th className="p-2">المبيعات اللي تشيل القسط</th><th className="p-2">السداد</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{plan.terms.map(t => { const on = sel?.n === t.n, rec = plan.recommended === t.n;
          return <tr key={t.n} onClick={() => setTerm(t.n)} className={`cursor-pointer transition ${on ? "bg-[var(--sky-light)]" : "hover:bg-[var(--bg)]"}`}>
            <td className="p-2 font-bold">{t.n} شهر {(rec || (sg?.raised && sg.n === t.n)) && <span className="mr-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">الأنسب</span>}</td>
            {t.feasible ? <>
              <td className="p-2 text-center"><b className="text-[15px] tabular-nums text-[var(--navy)]">{sar(t.F)}</b></td>
              <td className="p-2 text-center tabular-nums">{sar(t.installment)}</td>
              <td className="p-2 text-center tabular-nums text-[var(--muted)]">{sar(t.cost)}</td>
              <td className="p-2 text-center tabular-nums">{t.carry_sales !== null ? sar(t.carry_sales) : "—"}</td>
              <td className="p-2 text-center text-[11.5px] text-[var(--muted)]">استلام {t.start} · أقساط {t.first_payment} ← {t.last_payment}</td>
            </> : <td colSpan={5} className="p-2 text-center text-[12px]">{t.fix
              ? <span><span className="text-amber-800">على مبيعاتك دي مش هيتسدد.</span> مع مبيعات <b>{sar(t.fix.sales)}</b> شهرياً: تمويل <b className="text-[var(--navy)]">{sar(t.fix.F)}</b> · قسط {sar(t.fix.installment)}
                <button type="button" onClick={e => { e.stopPropagation(); apply(t.fix!.sales, t.n); }} className="mr-2 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--navy)]">طبّق</button></span>
              : <span className="text-red-700">المصاريف أكبر من اللي أي مبيعات معقولة بتجيبه — خفّض المصاريف الأول</span>}</td>}
          </tr>; })}</tbody>
      </table></div>
      <p className="mt-2 text-[11.5px] text-[var(--muted)]">«المبيعات اللي تشيل القسط» = المبيعات الشهرية اللي تغطي مصاريفك + القسط بعد ما الأمور تستقر. «الأنسب» = أقصر مدة بأقل تمويل تقريباً (تكلفة أقل).</p>
    </div>}

    {/* month by month */}
    {rows && <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <b className="text-[14px]">الخطة شهر بشهر — {useFin ? `مبيعات ${sar(o.sales)} + تمويل ${sar(useFin.F)} على ${useFin.n} شهر${o.financing ? " (بمبلغك)" : ""}` : `مبيعات ${sar(o.sales)} من غير تمويل`}</b>
        <span className="flex gap-2">
          <a href={`/report/plan?${q}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs font-bold text-[var(--navy)]"><Icon name="file" size={14} />تقرير PDF</a>
          <button type="button" disabled={busy} onClick={() => void approve()} className="rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60">{busy ? "بحفظ…" : "اعتمد الخطة"}</button>
        </span>
      </div>
      <div className="flex h-28 items-end gap-1 rounded-2xl bg-[var(--bg)] p-2">{rows.map(r => <div key={r.m} title={`${r.label}: ${sar(r.balance)}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
        <div className={`w-full rounded-t ${r.balance < o.buffer ? "bg-red-500" : "bg-[var(--sky)]"}`} style={{ height: `${Math.max(3, Math.abs(r.balance) / balMax * 100)}%` }} />
        <span className="mt-1 truncate text-[9px] text-[var(--muted)]">{r.label.split(" ")[0].slice(0, 3)}</span></div>)}</div>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-[12.5px] tabular-nums">
        <thead className="bg-[var(--sky-light)] text-[11px] text-[var(--muted)]"><tr><th className="p-2 text-right">الشهر</th><th className="p-2">مبيعات مطلوبة</th><th className="p-2">تحصيل</th><th className="p-2">موردين</th><th className="p-2">مصاريف</th><th className="p-2">ضريبة</th><th className="p-2">تمويل</th><th className="p-2">قسط</th><th className="p-2">الرصيد آخر الشهر</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{rows.map(r => <tr key={r.m}>
          <td className="whitespace-nowrap p-2 text-right font-bold">{r.label}</td>
          <td className="p-2 text-center">{r.sales ? short(r.sales) : "—"}</td>
          <td className="p-2 text-center text-emerald-700">{short(r.collections)}</td>
          <td className="p-2 text-center text-red-700">{r.suppliers ? short(r.suppliers) : "—"}</td>
          <td className="p-2 text-center">{short(r.expenses)}</td>
          <td className="p-2 text-center">{r.vat ? short(r.vat) : "—"}</td>
          <td className="p-2 text-center font-bold text-[var(--navy)]">{r.loan_in ? short(r.loan_in) : "—"}</td>
          <td className="p-2 text-center">{r.installment ? short(r.installment) : "—"}</td>
          <td className={`p-2 text-center font-extrabold ${r.balance < o.buffer ? "text-red-700" : "text-[var(--navy)]"}`}>{sar(r.balance)}</td></tr>)}</tbody>
      </table></div>
    </div>}

    {approved && <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-[12.5px] text-emerald-900 ring-1 ring-emerald-200">
      الخطة المعتمدة ({approved.approved_at.slice(0, 10)}): مبيعات {sar(approved.target_sales)} شهرياً{approved.financing ? ` · تمويل ${sar(approved.financing)} على ${approved.term} شهر بقسط ${sar(approved.installment)}` : " · من غير تمويل"}. هدف الشهر في الملخص بيتابع المبيعات دي.</div>}
    <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">الأرقام تقديرية: مبنية على متوسط مبيعاتك ({inp.base.months || "—"} شهر)، هامش الربح (التكلفة {Math.round(inp.base.cogs_ratio * 100)}% من المبيعات)، مصاريفك الشهرية {sar(monthOpex)}، ومدد السداد في فواتيرك. التمويل بقسط ثابت. المقاصات اللي ليك عند الموردين متخصومة من المدفوع.</p>
  </Card>;
}
