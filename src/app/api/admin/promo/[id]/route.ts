import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

const forbid = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser(); if (!u || u.role !== "admin") return forbid();
  const { id } = await params;
  await query("DELETE FROM promo_expenses WHERE id=$1", [Number(id)]);
  return NextResponse.json({ ok: true });
}
