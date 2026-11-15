import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadCollections, MONTH } from "@/lib/collections-data";

/** Amounts to collect from customers (kind=client) or pay suppliers (kind=supplier) in a month. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "supplier" ? "supplier" : "client", month = sp.get("month") || "";
  if (!MONTH.test(month)) return NextResponse.json({ error: "شهر غير صحيح" }, { status: 400 });
  return NextResponse.json(await loadCollections(kind, month));
}
