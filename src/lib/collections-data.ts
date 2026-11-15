import { computeFinance, loadInput, riyadhToday } from "@/lib/finance";
import { collectionPlan, monthEnd, receivedIn } from "@/lib/collections";

export type Kind = "client" | "supplier";
export const MONTH = /^20\d\d-(0[1-9]|1[0-2])$/;

/** Everything the collections tab and the PDF report show for one month. */
export async function loadCollections(kind: Kind, month: string) {
  const today = riyadhToday();
  const inp = await loadInput(today);
  // receivables/payables are "as of today" whatever the range; the range only feeds the monthly figures
  const fin = computeFinance(inp, `${month}-01`, monthEnd(month) < today ? monthEnd(month) : today);
  const book = kind === "client" ? fin.ar : fin.ap;
  const plan = collectionPlan(book.open.map(o => ({ id: o.id, no: o.no, date: o.date, party: o.party, unpaid: o.unpaid, due: o.due })), month, today);
  const start = `${month}-01`, stop = monthEnd(month) < today ? monthEnd(month) : today;
  // supplier payments aren't mirrored from Daftra, so "paid this month" is only known for customers
  const done = kind === "client" && start <= today ? receivedIn(inp.payments, start, stop) : null;
  return { kind, ...plan, done, current: month === today.slice(0, 7) };
}
