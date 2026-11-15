"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok) window.location.href = "/"; else setErr(j?.error || "تعذر تسجيل الدخول");
  }
  return <div dir="rtl" className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,#0d3a40_0%,#0b1d20_100%)] p-4">
    <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-[var(--card)] p-6 shadow-2xl">
      <div className="text-center"><div className="text-[22px] font-extrabold text-[var(--ink)]">المتابعة المالية</div><div className="mt-0.5 text-xs text-[var(--muted)]">Elite Skin</div></div>
      <label className="mt-6 block text-sm font-bold text-[var(--ink)]" htmlFor="pw">كلمة المرور</label>
      <input id="pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} required className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-base" />
      {err && <div className="mt-3 rounded-xl bg-red-50 p-2.5 text-sm text-red-800">{err}</div>}
      <button type="submit" disabled={busy || !pw} className="mt-4 w-full rounded-full bg-[var(--navy)] py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "جارٍ الدخول…" : "دخول"}</button>
    </form>
  </div>;
}
