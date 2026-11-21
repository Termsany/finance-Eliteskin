import { describe, it, expect } from "vitest";
import { buildBriefing, type BriefingInput } from "@/lib/briefing";

const base: BriefingInput = {
  today: "2026-11-17", collected_yesterday: 12000, collected_month: 50000,
  due_today: 8000, overdue: 53670, overdue_parties: 6, ar_total: 88092, ap_week: 34500,
  balance: 120000, net_month: -18697, sales_month: 15458, gross_margin: 42,
  sales_target: 500000, profit_target: 75000,
  due_promises: [{ customer: "مركز الشفاء", amount: 5000 }], urgent: [{ title: "وعد دفع فات ميعاده" }],
};

describe("buildBriefing", () => {
  it("summary lines reflect the day", () => {
    const b = buildBriefing(base);
    expect(b.lines.find(l => l.label === "اتحصّل امبارح")?.value).toContain("12,000");
    expect(b.lines.find(l => l.label === "متأخر عليك تحصيله")?.tone).toBe("bad");
    expect(b.lines.find(l => l.label === "ربح الشهر لحد دلوقتي")?.tone).toBe("bad");
  });
  it("text includes collected, due, promises and urgent items", () => {
    const t = buildBriefing(base).text;
    expect(t).toContain("12,000");
    expect(t).toContain("مركز الشفاء");
    expect(t).toContain("وعد دفع فات ميعاده");
    expect(t).toContain("53,670");
  });
  it("omits the balance line when there is no balance", () => {
    const b = buildBriefing({ ...base, balance: null });
    expect(b.lines.some(l => l.label === "رصيدك النهارده")).toBe(false);
    expect(b.text).not.toContain("رصيدك:");
  });
  it("drops the urgent block when nothing is urgent", () => {
    const b = buildBriefing({ ...base, urgent: [] });
    expect(b.text).not.toContain("محتاج انتباهك");
  });
});
