import { query } from "@/lib/db";
import { decryptKey, encryptKey } from "@/lib/ai-provider";

/** Key/value app settings (Daftra connection, login password hash). Secrets are stored encrypted. */
export async function getSetting(key: string): Promise<string | null> {
  const r = await query<{ value: string }>("SELECT value FROM app_settings WHERE key=$1", [key]).catch(() => ({ rows: [] as Array<{ value: string }> }));
  return r.rows[0]?.value ?? null;
}
export async function setSetting(key: string, value: string | null) {
  if (value === null) { await query("DELETE FROM app_settings WHERE key=$1", [key]); return; }
  await query("INSERT INTO app_settings(key, value, updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=$2, updated_at=now()", [key, value]);
}
export async function getSecret(key: string) { const v = await getSetting(key); if (!v) return null; try { return decryptKey(v); } catch { return null; } }
export const setSecret = (key: string, plain: string | null) => setSetting(key, plain ? encryptKey(plain) : null);

export type DaftraCfg = { sub: string; key: string; domain: string; source: "app" | "env" };
/** Daftra connection: what was saved from the settings page, else the server environment. */
export async function daftraCfg(): Promise<DaftraCfg | null> {
  const [sub, key, domain] = await Promise.all([getSetting("daftra_subdomain"), getSecret("daftra_key"), getSetting("daftra_domain")]);
  if (sub && key) return { sub, key, domain: domain || "daftra.com", source: "app" };
  const es = (process.env.DAFTRA_SUBDOMAIN || "").trim(), ek = (process.env.DAFTRA_API_KEY || process.env.DAFTRA_APIKEY || "").trim();
  return es && ek ? { sub: es, key: ek, domain: (process.env.DAFTRA_DOMAIN || "daftra.com").trim(), source: "env" } : null;
}
/** "eliteskin" from "eliteskin", "eliteskin.daftra.com" or a full URL. */
export const cleanSub = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[./]/)[0].replace(/[^a-z0-9-]/g, "").slice(0, 63);
