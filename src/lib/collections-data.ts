import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { monthlyPlan, receivedIn } from "@/lib/collections";

export type Kind = "client" | "supplier";
/** A bucket key: "overdue", "later" or a month YYYY-MM. */
export const SEL = /^(overdue|later|20\d\d-(0[1-9]|1[0-2]))$/;

/** Everything the collections tab and the PDF report show: month buckets and every customer's amounts for one of them. */
export async function loadMonthly(kind: Kind, sel: string) {
  const today = riyadhToday();
  const inp = await loadInput(today);
  // receivables / payables are "as of today" whatever the range
  const fin = computeFinance(inp, `${today.slice(0, 7)}-01`, today);
  const book = kind === "client" ? fin.ar : fin.ap;
  const plan = monthlyPlan(book.open.map(o => ({ id: o.id, no: o.no, date: o.date, party: o.party, unpaid: o.unpaid, due: o.due })), today, SEL.test(sel) ? sel : today.slice(0, 7));
  // supplier payments aren't mirrored from Daftra, so "collected" is only known for customers
  const done = kind === "client" ? receivedIn(inp.payments, `${today.slice(0, 7)}-01`, today) : null;
  return { kind, ...plan, done };
}
