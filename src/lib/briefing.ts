/**
 * The daily briefing: a short "where the money is today" summary the owner can read without opening the app
 * (shown in-app, and pushed once a day to a webhook if one is set). Pure — the API feeds it the day's figures.
 */
export type BriefingInput = {
  today: string;
  collected_yesterday: number; collected_month: number;
  due_today: number; overdue: number; overdue_parties: number;
  ar_total: number; ap_week: number;
  balance: number | null;
  net_month: number; sales_month: number; gross_margin: number | null;
  sales_target: number | null; profit_target: number | null;
  due_promises: Array<{ customer: string; amount: number | null }>;
  urgent: Array<{ title: string }>;
};

const k = (n: number) => Math.round(n).toLocaleString("en-US");

export function buildBriefing(x: BriefingInput) {
  const lines: Array<{ label: string; value: string; tone?: "good" | "bad" | "warn" }> = [
    { label: "اتحصّل امبارح", value: `${k(x.collected_yesterday)} ر.س`, tone: x.collected_yesterday > 0 ? "good" : undefined },
    { label: "مطلوب تحصيله النهارده", value: `${k(x.due_today)} ر.س` },
    { label: "متأخر عليك تحصيله", value: `${k(x.overdue)} ر.س عند ${x.overdue_parties} عميل`, tone: x.overdue > 0 ? "bad" : "good" },
    { label: "مستحق للموردين الأسبوع ده", value: `${k(x.ap_week)} ر.س`, tone: x.ap_week > 0 ? "warn" : undefined },
    ...(x.balance !== null ? [{ label: "رصيدك النهارده", value: `${k(x.balance)} ر.س` } as const] : []),
    { label: "ربح الشهر لحد دلوقتي", value: `${k(x.net_month)} ر.س`, tone: x.net_month < 0 ? "bad" : "good" },
    ...(x.gross_margin !== null ? [{ label: "هامش مجمل الربح", value: `${Math.round(x.gross_margin)}%` } as const] : []),
    ...(x.sales_target && x.sales_target > 0 ? [{ label: "تحقيق هدف المبيعات", value: `${Math.round(x.sales_month / x.sales_target * 100)}%`, tone: (x.sales_month >= x.sales_target ? "good" : undefined) as "good" | undefined }] : []),
  ];
  const parts: string[] = [`☀️ صباح الخير — ملخص ${x.today}`];
  parts.push(`• اتحصّل امبارح: ${k(x.collected_yesterday)} ر.س · المحصّل الشهر: ${k(x.collected_month)} ر.س`);
  parts.push(`• مطلوب تحصيله النهارده: ${k(x.due_today)} ر.س${x.overdue > 0 ? ` · متأخر: ${k(x.overdue)} ر.س (${x.overdue_parties} عميل)` : ""}`);
  if (x.due_promises.length) parts.push(`• وعود دفع فات ميعادها: ${x.due_promises.slice(0, 3).map(p => `${p.customer}${p.amount ? ` ${k(p.amount)}` : ""}`).join("، ")}`);
  if (x.ap_week > 0) parts.push(`• مستحق للموردين الأسبوع ده: ${k(x.ap_week)} ر.س`);
  if (x.balance !== null) parts.push(`• رصيدك: ${k(x.balance)} ر.س`);
  parts.push(`• الشهر: مبيعات ${k(x.sales_month)} · ربح ${k(x.net_month)} ر.س${x.gross_margin !== null ? ` · هامش ${Math.round(x.gross_margin)}%` : ""}`);
  if (x.sales_target && x.sales_target > 0) parts.push(`• هدف المبيعات: ${k(x.sales_target)} ر.س — تحقق ${Math.round(x.sales_month / x.sales_target * 100)}%`);
  if (x.urgent.length) parts.push(`\n🔔 محتاج انتباهك:\n${x.urgent.slice(0, 3).map(u => `- ${u.title}`).join("\n")}`);
  return { title: `ملخص ${x.today}`, lines, text: parts.join("\n") };
}
export type Briefing = ReturnType<typeof buildBriefing>;
