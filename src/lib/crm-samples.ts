const CRM_BASE = process.env.CRM_BASE_URL;
const KEY = process.env.SHARED_API_KEY;

type CrmRepSamples = {
  rep_name: string;
  total_units: number;
  by_doctor: Array<{ doctor: string; clinic: string; product: string; units: number }>;
};

let cache: { key: string; data: CrmRepSamples[]; at: number } | null = null;
const TTL = 5 * 60_000;

export async function fetchCrmSamples(month: string, repName?: string): Promise<CrmRepSamples[] | null> {
  if (!CRM_BASE || !KEY) return null;
  const cacheKey = `${month}:${repName || "*"}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.at < TTL) return cache.data;
  try {
    const params = new URLSearchParams({ month });
    if (repName) params.set("rep", repName);
    const r = await fetch(`${CRM_BASE}/api/shared/samples?${params}`, {
      headers: { "x-api-key": KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const json = await r.json();
    const data = (json.reps || []) as CrmRepSamples[];
    cache = { key: cacheKey, data, at: Date.now() };
    return data;
  } catch {
    return null;
  }
}
