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
  net_month: number; sales_month: number;
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
  ];
  const parts: string[] = [`☀️ صباح الخير — ملخص ${x.today}`];
  parts.push(`• اتحصّل امبارح: ${k(x.collected_yesterday)} ر.س · المحصّل الشهر: ${k(x.collected_month)} ر.س`);
  parts.push(`• مطلوب تحصيله النهارده: ${k(x.due_today)} ر.س${x.overdue > 0 ? ` · متأخر: ${k(x.overdue)} ر.س (${x.overdue_parties} عميل)` : ""}`);
  if (x.due_promises.length) parts.push(`• وعود دفع فات ميعادها: ${x.due_promises.slice(0, 3).map(p => `${p.customer}${p.amount ? ` ${k(p.amount)}` : ""}`).join("، ")}`);
  if (x.ap_week > 0) parts.push(`• مستحق للموردين الأسبوع ده: ${k(x.ap_week)} ر.س`);
  if (x.balance !== null) parts.push(`• رصيدك: ${k(x.balance)} ر.س`);
  parts.push(`• الشهر: مبيعات ${k(x.sales_month)} · ربح ${k(x.net_month)} ر.س`);
  if (x.urgent.length) parts.push(`\n🔔 محتاج انتباهك:\n${x.urgent.slice(0, 3).map(u => `- ${u.title}`).join("\n")}`);
  return { title: `ملخص ${x.today}`, lines, text: parts.join("\n") };
}
export type Briefing = ReturnType<typeof buildBriefing>;
