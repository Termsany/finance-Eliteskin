import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { COOKIE, checkPassword, cookieOptions, newToken } from "@/lib/session";
import { hitRateLimitDb } from "@/lib/rate-limit";

const LIMIT = 8, WINDOW = 15 * 60 * 1000;

/** Only wrong passwords count toward the limit (8 per 15 minutes per address); a right one clears it. */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const key = `login:${ip}`;
  const blocked = await query<{ b: boolean }>("SELECT blocked_until > now() AS b FROM login_attempts WHERE key=$1", [key]).then(r => !!r.rows[0]?.b).catch(() => false);
  if (blocked) return NextResponse.json({ error: "محاولات غلط كتير — جرّب بعد ربع ساعة" }, { status: 429 });
  const b = await req.json().catch(() => null) as { password?: unknown } | null;
  if (!(await checkPassword(String(b?.password || "")))) {
    const rl = await hitRateLimitDb(key, LIMIT, WINDOW).catch(() => ({ allowed: true, retryAfterMs: 0 }));
    return NextResponse.json({ error: rl.allowed ? "كلمة المرور غير صحيحة" : "محاولات غلط كتير — جرّب بعد ربع ساعة" }, { status: rl.allowed ? 401 : 429 });
  }
  await query("DELETE FROM login_attempts WHERE key=$1", [key]).catch(() => {});
  // remember the last successful login (shown in settings as a simple security signal)
  await query("INSERT INTO app_settings(key, value, updated_at) VALUES('last_login', $1, now()) ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=now()", [`${new Date().toISOString()}|${ip}`]).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await newToken(), cookieOptions);
  return res;
}
