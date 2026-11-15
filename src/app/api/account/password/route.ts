import { NextResponse } from "next/server";
import { COOKIE, changePassword, checkPassword, cookieOptions, getCurrentUser, newToken } from "@/lib/session";

/** Change the login password; other devices are signed out, this one stays in. */
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as { currentPassword?: unknown; newPassword?: unknown } | null;
  const cur = String(b?.currentPassword || ""), nw = String(b?.newPassword || "");
  if (nw.length < 8) return NextResponse.json({ error: "كلمة المرور الجديدة 8 أحرف على الأقل" }, { status: 400 });
  if (!(await checkPassword(cur))) return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 400 });
  await changePassword(nw);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await newToken(), cookieOptions);
  return res;
}
