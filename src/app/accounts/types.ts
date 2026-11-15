import type { computeFinance } from "@/lib/finance";
import type { Attention } from "@/lib/fin-books";

export type FinData = ReturnType<typeof computeFinance> & {
  prev?: import("@/lib/fin-ai").PrevKpi; ai?: boolean; link?: null; attention?: Attention[];
  docs?: { total: number; before_start: number; in_period: number };
  sync: { started_at: string | null; finished_at: string | null; ok: boolean | null; message: string; invoices?: number; running: boolean }; today: string;
};
