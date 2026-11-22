import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accounts = (await query<{ id: number; code: string; name: string; cat_id: number | null; balance: number | null; debit_total: number | null; credit_total: number | null }>(
    "SELECT id, code, name, cat_id, balance::float8, debit_total::float8, credit_total::float8 FROM daftra_accounts ORDER BY code"
  ).catch(() => ({ rows: [] }))).rows;

  const bankTreasury = accounts.filter(a => a.code.startsWith("1201") || a.code.startsWith("1202"));

  const jeStats = (await query<{ account_id: number; code: string; name: string; entries: number; computed_balance: number }>(
    `SELECT a.id account_id, a.code, a.name, count(*)::int entries, (sum(j.debit) - sum(j.credit))::float8 computed_balance
     FROM daftra_journal_entries j JOIN daftra_accounts a ON a.id = j.account_id
     WHERE a.code LIKE '1201%' OR a.code LIKE '1202%'
     GROUP BY a.id, a.code, a.name ORDER BY a.code`
  ).catch(() => ({ rows: [] }))).rows;

  const totalAccounts = accounts.length;
  const hasBalance = accounts.filter(a => a.balance !== null).length;
  const hasDebitTotal = accounts.filter(a => a.debit_total !== null).length;
  const totalJournalEntries = (await query<{ n: number }>("SELECT count(*)::int n FROM daftra_journal_entries").catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;

  const lastSync = (await query<{ synced_at: string }>("SELECT synced_at::text FROM daftra_sync_log ORDER BY synced_at DESC LIMIT 1").catch(() => ({ rows: [] }))).rows[0]?.synced_at ?? null;

  return NextResponse.json({
    summary: {
      total_accounts: totalAccounts,
      accounts_with_balance_field: hasBalance,
      accounts_with_debit_total_field: hasDebitTotal,
      total_journal_entries: totalJournalEntries,
      last_sync: lastSync,
      verdict: hasBalance > 0
        ? "حقل balance موجود — الأرصدة من دفترة شغّالة"
        : hasDebitTotal > 0
        ? "حقل balance فاضي لكن debit_total/credit_total موجودين — الأرصدة محسوبة منهم"
        : totalJournalEntries > 0
        ? "الحقلين فاضيين لكن القيود موجودة — الأرصدة محسوبة من القيود"
        : "مفيش بيانات أرصدة من دفترة — البرنامج بيستخدم الإدخال اليدوي",
    },
    bank_treasury: {
      from_balance_field: bankTreasury.filter(a => a.balance !== null).map(a => ({ code: a.code, name: a.name, balance: a.balance })),
      from_debit_credit: bankTreasury.filter(a => a.debit_total !== null).map(a => ({ code: a.code, name: a.name, computed: Math.round(((a.debit_total || 0) - (a.credit_total || 0)) * 100) / 100 })),
      from_journal_entries: jeStats,
      codes_note: "1201xx = بنك (مفترض) · 1202xx = خزنة (مفترض) — تأكد من الأسماء فوق",
    },
    all_accounts: accounts,
  });
}
