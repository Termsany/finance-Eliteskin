import { query } from "@/lib/db";

/**
 * Backup of everything this app owns (not the Daftra mirror, which re-syncs). Used by the "download backup"
 * button in settings and by a nightly on-disk dump. The Daftra connection key and any AI key live encrypted in
 * app_settings; `withSecrets` keeps them (the nightly on-disk copy) or drops them (the browser download).
 */
export const APP_TABLES = [
  "fin_settings", "fin_account_overrides", "fin_audit_reviews", "app_expenses",
  "offset_prices", "offset_orders", "offset_order_items",
] as const;
const SECRET_KEYS = ["daftra_key", "ai_api_key"];

export async function buildBackup(withSecrets: boolean) {
  const data: Record<string, unknown[]> = {};
  for (const t of APP_TABLES) {
    const r = await query(`SELECT * FROM ${t}`).catch(() => ({ rows: [] }));
    data[t] = r.rows;
  }
  // key/value settings: keep the password hash and config; drop encrypted secrets from the browser copy
  const s = await query<{ key: string; value: string }>("SELECT key, value FROM app_settings").catch(() => ({ rows: [] as Array<{ key: string; value: string }> }));
  data.app_settings = s.rows.filter(r => withSecrets || !SECRET_KEYS.includes(r.key));
  // ai_settings holds an encrypted key; include only with secrets
  if (withSecrets) { const a = await query("SELECT * FROM ai_settings").catch(() => ({ rows: [] })); data.ai_settings = a.rows; }
  return { app: "elite-finance", version: 2, taken_at: new Date().toISOString(), tables: data };
}
