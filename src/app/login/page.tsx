"use client";
import { useState } from "react";
import { Logo } from "@/components/Logo";

/** Same look as «الميدان»'s sign-in: soft light background, the full logo, one card. */
export default function Login() {
  const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    // a full load so the server pages see the new session cookie
    if (r?.ok) window.location.assign("/"); else setErr(j?.error || "تعذر تسجيل الدخول");
  }
  return <div dir="rtl" className="flex min-h-screen items-center justify-center p-4" style={{ background: "radial-gradient(900px 480px at 50% -8%, #e3f3f0 0%, #f4f8f8 55%, #ffffff 100%)" }}>
    <div className="w-full max-w-[420px]">
      <div className="mb-6 text-center">
        <Logo variant="full" tone="onLight" markSize={170} className="mb-2 h-auto w-[230px] sm:w-[260px]" />
        <div className="text-[15px] font-extrabold text-[#10484f]">المتابعة المالية</div>
        <div className="mt-0.5 text-xs text-[#5f7177]">الحسابات والعملاء والموردين والمصروفات</div>
      </div>
      <form onSubmit={submit} className="rounded-[26px] border border-[#e3ecec] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(16,72,79,.35)]">
        <label className="block text-sm font-bold text-[#16232b]" htmlFor="pw">كلمة المرور</label>
        <input id="pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} required
          className="mt-1.5 w-full rounded-2xl border border-[#cddddd] bg-white px-4 py-3 text-base text-[#16232b] outline-none transition focus:border-[#33b3a6] focus:ring-4 focus:ring-[#33b3a6]/15" />
        {err && <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-800">{err}</div>}
        <button type="submit" disabled={busy || !pw} className="mt-4 w-full rounded-full bg-[#10484f] py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 disabled:opacity-60">{busy ? "جارٍ الدخول…" : "دخول"}</button>
        <p className="mt-3 text-center text-[11px] text-[#5f7177]">نسيت كلمة المرور؟ موجودة في ملف ‎.env‎ على السيرفر (APP_PASSWORD) لحد ما تغيّرها من الإعدادات.</p>
      </form>
    </div>
  </div>;
}
