import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadMonthly, SEL } from "@/lib/collections-data";

/** Month-by-month amounts to collect (kind=client) or pay (kind=supplier); sel = overdue | YYYY-MM | later. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "supplier" ? "supplier" : "client", sel = sp.get("sel") || "";
  if (sel && !SEL.test(sel)) return NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 });
  return NextResponse.json(await loadMonthly(kind, sel));
}
