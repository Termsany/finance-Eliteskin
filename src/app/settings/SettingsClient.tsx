"use client";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AiSetup } from "../accounts/ai";

const box = "rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5";
const inp = "w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm";
const btn = "rounded-full bg-[var(--navy)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60";
const lbl = "mb-1 block text-xs font-bold text-[var(--muted)]";

export default function SettingsClient() {
  return <div className="mt-4 grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
    <Daftra />
    <Books />
    <div className={box}><div className="mb-3 text-sm font-extrabold">المستشار المالي (الذكاء الاصطناعي)</div><AiPanel /></div>
    <Password />
    <Backup />
    <div className={`${box} flex items-center justify-between gap-3`}>
      <div><div className="text-sm font-extrabold">المظهر</div><div className="mt-0.5 text-xs text-[var(--muted)]">الوضع الليلي أريح للعين بالليل. الاختيار بيتحفظ على الجهاز ده.</div></div>
      <ThemeToggle className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--navy)]" />
    </div>
  </div>;
}

function Daftra() {
  const toast = useToast();
  const [s, setS] = useState<{ connected: boolean; source: string | null; subdomain: string; domain: string; key_hint: string } | null>(null);
  const [sub, setSub] = useState(""); const [domain, setDomain] = useState("daftra.com"); const [key, setKey] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/admin/daftra/connection", { cache: "no-store" }).then(r => r.json()).then(j => { setS(j); setSub(j.subdomain || ""); setDomain(j.domain || "daftra.com"); }).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  async function send(test: boolean) {
    setBusy(test ? "test" : "save");
    const r = await fetch("/api/admin/daftra/connection", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ subdomain: sub, domain, api_key: key, test_only: test }) });
    const j = await r.json().catch(() => null); setBusy(null);
    if (!r.ok) { toast(j?.error || "تعذر الاتصال", "error"); return; }
    if (test) toast("الاتصال بدفترة شغال ✓", "success"); else { toast("اتحفظ — بدأت المزامنة، الأرقام هتظهر خلال دقيقة", "success"); setKey(""); void load(); }
  }
  return <div className={box}>
    <div className="flex items-center justify-between gap-2"><div className="text-sm font-extrabold">ربط دفترة</div>
      {s && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${s.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{s.connected ? `مربوط${s.source === "env" ? " من السيرفر" : ""}` : "مش مربوط"}</span>}</div>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">البرنامج بيقرأ من دفترة بس ومش بيعدّل فيها. المفتاح من دفترة: الإعدادات ← مفاتيح API. بيتحفظ مشفّر على السيرفر وما بيظهرش تاني.</p>
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="sm:col-span-2"><span className={lbl}>اسم الحساب (الساب دومين)</span><input dir="ltr" value={sub} onChange={e => setSub(e.target.value)} placeholder="eliteskin" className={inp} /></label>
      <label><span className={lbl}>الموقع</span><select value={domain} onChange={e => setDomain(e.target.value)} className={inp}><option value="daftra.com">daftra.com</option><option value="daftara.com">daftara.com</option></select></label>
      <label className="sm:col-span-3"><span className={lbl}>مفتاح الـ API {s?.key_hint && <>— المحفوظ {s.key_hint} (سيبه فاضي عشان تحتفظ بيه)</>}</span><input dir="ltr" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} className={inp} /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!!busy || !sub} onClick={() => void send(true)} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--navy)] disabled:opacity-60">{busy === "test" ? "بجرب…" : "اختبار الاتصال"}</button>
      <button type="button" disabled={!!busy || !sub} onClick={() => void send(false)} className={btn}>{busy === "save" ? "بحفظ…" : "حفظ وابدأ المزامنة"}</button></div>
  </div>;
}

function Books() {
  const toast = useToast();
  const [v, setV] = useState<string | null>(null); const [gm, setGm] = useState(45); const [nm, setNm] = useState(15);
  const [st, setSt] = useState(""); const [pt, setPt] = useState("");
  useEffect(() => { fetch("/api/admin/finance/settings", { cache: "no-store" }).then(r => r.json()).then(j => { setV(j.books_start || ""); if (j.target_gross_margin) setGm(j.target_gross_margin); if (j.target_net_margin !== undefined) setNm(j.target_net_margin); setSt(j.monthly_sales_target != null ? String(j.monthly_sales_target) : ""); setPt(j.monthly_profit_target != null ? String(j.monthly_profit_target) : ""); }).catch(() => {}); }, []);
  async function put(body: object, ok: string) {
    const r = await fetch("/api/admin/finance/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null); if (r.ok) toast(ok, "success"); else toast(j?.error || "تعذر الحفظ", "error");
  }
  return <div className={box}>
    <div className="text-sm font-extrabold">بداية الحسابات والأهداف</div>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">الأرباح والمصروفات بتتحسب من التاريخ ده. سيبه فاضي عشان كل الفواتير تتحسب. المديونيات بتفضل كاملة في كل الحالات.</p>
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex-1"><span className={lbl}>الحسابات من</span><input type="date" value={v ?? ""} onChange={e => setV(e.target.value)} className={inp} /></label>
      <button type="button" onClick={() => void put({ books_start: v || null }, v ? `الحسابات بقت من ${v}` : "الحسابات بقت من أول فاتورة")} className={btn}>حفظ</button>
      <button type="button" onClick={() => { setV(""); void put({ books_start: null }, "الحسابات بقت من أول فاتورة"); }} className="rounded-full px-3 py-2 text-sm font-bold text-[var(--navy)]">من أول فاتورة</button>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <label><span className={lbl}>هامش مجمل الربح المستهدف %</span><input type="number" min={5} max={90} value={gm} onChange={e => setGm(Number(e.target.value))} className={inp} /></label>
      <label><span className={lbl}>صافي الربح المستهدف %</span><input type="number" min={0} max={60} value={nm} onChange={e => setNm(Number(e.target.value))} className={inp} /></label>
    </div>
    <button type="button" onClick={() => void put({ target_gross_margin: gm, target_net_margin: nm }, "اتحفظت الأهداف")} className={`mt-3 ${btn}`}>حفظ الأهداف</button>
    <div className="mt-5 border-t border-[var(--border)] pt-4">
      <div className="text-sm font-extrabold">هدف الشهر</div>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">المبلغ اللي عايز تبيعه وتكسبه صافي في الشهر. بيظهر في الملخص «ماشي على الهدف ولا لأ» حسب اليوم في الشهر. سيبه فاضي لو مش عايز هدف.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label><span className={lbl}>مبيعات الشهر المستهدفة (ر.س)</span><input value={st} onChange={e => setSt(e.target.value)} inputMode="decimal" dir="ltr" placeholder="مثلاً 500000" className={inp} /></label>
        <label><span className={lbl}>صافي ربح الشهر المستهدف (ر.س)</span><input value={pt} onChange={e => setPt(e.target.value)} inputMode="decimal" dir="ltr" placeholder="مثلاً 75000" className={inp} /></label>
      </div>
      <button type="button" onClick={() => void put({ monthly_sales_target: st === "" ? null : Number(st.replace(/,/g, "")), monthly_profit_target: pt === "" ? null : Number(pt.replace(/,/g, "")) }, "اتحفظ هدف الشهر")} className={`mt-3 ${btn}`}>حفظ هدف الشهر</button>
    </div>
  </div>;
}

function AiPanel() {
  const [k, setK] = useState(0);
  return <AiSetup key={k} onSaved={() => setK(k + 1)} />;
}

function Backup() {
  return <div className={box}>
    <div className="text-sm font-extrabold">نسخة احتياطية</div>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">البرنامج بياخد نسخة تلقائية كل يوم على السيرفر (آخر 14 يوم). ده بيحفظ البيانات اللي اتسجلت في البرنامج نفسه: المصروفات، المقاصة والأسعار المتفق عليها، والإعدادات — بيانات دفترة بترجع لوحدها بالمزامنة. تقدر كمان تنزّل نسخة دلوقتي وتحتفظ بيها عندك.</p>
    <a href="/api/admin/backup" className={`mt-3 inline-block ${btn}`}>تنزيل نسخة احتياطية الآن</a>
  </div>;
}

function Password() {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [again, setAgain] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mismatch = again.length > 0 && again !== nw;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (nw.length < 8) return setMsg({ ok: false, text: "كلمة المرور الجديدة 8 أحرف على الأقل" });
    if (nw !== again) return setMsg({ ok: false, text: "تأكيد كلمة المرور مش مطابق" });
    if (nw === cur) return setMsg({ ok: false, text: "كلمة المرور الجديدة لازم تختلف عن الحالية" });
    setBusy(true);
    const r = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }).catch(() => null);
    const j = await r?.json().catch(() => null); setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: j?.error || "تعذر تغيير كلمة المرور" });
    setMsg({ ok: true, text: "اتغيرت كلمة المرور. أي جهاز تاني مسجل دخول هيطلب الباسورد الجديد." }); setCur(""); setNw(""); setAgain("");
  }
  const t = show ? "text" : "password";
  return <form onSubmit={submit} className={`${box} space-y-3`}>
    <div className="text-sm font-extrabold">تغيير كلمة المرور</div>
    <label className="block"><span className={lbl}>كلمة المرور الحالية</span><input type={t} autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} required className={inp} /></label>
    <label className="block"><span className={lbl}>كلمة المرور الجديدة</span><input type={t} autoComplete="new-password" value={nw} onChange={e => setNw(e.target.value)} required minLength={8} placeholder="8 أحرف على الأقل" className={inp} /></label>
    <label className="block"><span className={lbl}>تأكيد كلمة المرور الجديدة</span><input type={t} autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} required className={inp} />
      {mismatch && <span className="mt-1 block text-xs text-red-700">مش مطابقة للجديدة</span>}</label>
    <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />إظهار كلمات المرور</label>
    {msg && <div className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{msg.text}</div>}
    <button type="submit" disabled={busy || mismatch} className={btn}>{busy ? "جارٍ الحفظ…" : "تغيير كلمة المرور"}</button>
  </form>;
}
