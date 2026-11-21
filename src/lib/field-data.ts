/**
 * Fetch field data from الميدان (CRM) via its protected shared API.
 * Needs CRM_BASE_URL and SHARED_API_KEY env vars set on the server.
 * Returns null silently when the CRM is unreachable or unconfigured.
 */
export type RepFollowup = {
  client_id: string; result: string; promise_date: string | null;
  promise_amount: number | null; note: string; created_at: string;
  rep_name: string;
};
export type SampleRow = {
  product_name: string; doctor_name: string; clinic_name: string;
  rep_name: string; quantity: number; visited_at: string;
};
export type RepExpenseRow = {
  rep_name: string; category: string; amount: number;
  expense_date: string; merchant: string; description: string;
};
export type RepTarget = {
  rep_name: string; annual: number; month_target: number; month_actual: number;
};
export type FieldData = {
  today: string; month: string;
  followups: RepFollowup[];
  samples: SampleRow[];
  expenses: { month: string; rows: RepExpenseRow[]; total: number };
  targets: RepTarget[];
};

let cache: { data: FieldData; at: number } | null = null;
const TTL = 5 * 60_000;

export async function fetchFieldData(): Promise<FieldData | null> {
  const base = process.env.CRM_BASE_URL;
  const key = process.env.SHARED_API_KEY;
  if (!base || !key) return null;
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const r = await fetch(`${base}/api/shared/field`, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as FieldData;
    cache = { data, at: Date.now() };
    return data;
  } catch {
    return null;
  }
}
