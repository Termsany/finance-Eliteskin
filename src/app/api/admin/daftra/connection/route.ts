import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { cleanSub, daftraCfg, getSetting, setSecret, setSetting } from "@/lib/settings";
import { syncDaftra, testDaftra } from "@/lib/daftra";

export const maxDuration = 300;
const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** What is connected (never the key itself). */
export async function GET() {
  if (!(await getCurrentUser())) return forbid();
  const c = await daftraCfg();
  return NextResponse.json({ connected: !!c, source: c?.source ?? null, subdomain: c?.sub ?? (await getSetting("daftra_subdomain")) ?? "", domain: c?.domain ?? "daftra.com",
    key_hint: c ? `••••${c.key.slice(-4)}` : "" });
}

/** Save the connection after a successful test, then sync right away. An empty key keeps the saved one. */
export async function PUT(req: Request) {
  if (!(await getCurrentUser())) return forbid();
  const b = await req.json().catch(() => null) as { subdomain?: unknown; domain?: unknown; api_key?: unknown; test_only?: unknown } | null;
  const sub = cleanSub(String(b?.subdomain || ""));
  const domain = ["daftra.com", "daftara.com"].includes(String(b?.domain)) ? String(b?.domain) : "daftra.com";
  let key = String(b?.api_key || "").trim();
  if (!sub) return NextResponse.json({ error: "اكتب اسم حسابك في دفترة (الساب دومين)" }, { status: 400 });
  if (!key) { const cur = await daftraCfg(); if (cur) key = cur.key; }
  if (key.length < 8 || key.length > 300) return NextResponse.json({ error: "اكتب مفتاح الـ API من دفترة" }, { status: 400 });
  try { await testDaftra({ sub, key, domain, source: "app" }); }
  catch (e) { return NextResponse.json({ error: `دفترة رفضت الاتصال: ${String((e as Error).message).slice(0, 160)}` }, { status: 400 }); }
  if (b?.test_only) return NextResponse.json({ ok: true, tested: true });
  await setSetting("daftra_subdomain", sub); await setSetting("daftra_domain", domain); await setSecret("daftra_key", key);
  void syncDaftra().catch(e => console.error("daftra sync after connect", e));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!(await getCurrentUser())) return forbid();
  await setSecret("daftra_key", null);
  return NextResponse.json({ ok: true });
}
