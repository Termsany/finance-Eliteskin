// One-time import from the first version of the app (data/db.json): expenses, the Daftra connection
// and the Anthropic key. Runs at every start but does nothing once done or when there is no old file.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import pg from "pg";

const dir = process.env.LEGACY_DATA_DIR || "/app/legacy";
const file = join(dir, "db.json");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

// same scheme as src/lib/ai-provider.ts (AES-256-GCM, key = sha256 of the server secret)
const secret = () => createHash("sha256").update(process.env.AI_SETTINGS_SECRET || process.env.SESSION_SECRET || process.env.DATABASE_URL || "elite-finance").digest();
function encrypt(plain) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString("base64")).join(".");
}
const M = /^\d{4}-\d{2}$/, D = /^\d{4}-\d{2}-\d{2}$/;
const CATS = ["إيجار", "مرتبات", "تسويق", "مرافق", "أقساط", "صيانة", "اشتراكات", "أخرى"];

async function main() {
  if (!existsSync(file)) return console.log("legacy import: no old data file");
  const done = await pool.query("SELECT 1 FROM app_settings WHERE key='legacy_imported'");
  if (done.rowCount) return console.log("legacy import: already done");
  const db = JSON.parse(readFileSync(file, "utf8"));
  const c = await pool.connect();
  let n = 0;
  try {
    await c.query("BEGIN");
    for (const e of Array.isArray(db.expenses) ? db.expenses : []) {
      const type = ["fixed", "temp", "once"].includes(e.type) ? e.type : "once", amount = Number(e.amount);
      if (!e.name || !(amount > 0)) continue;
      const row = { start: M.test(e.start || "") ? e.start : null, end: M.test(e.end || "") ? e.end : null, stop: M.test(e.stop || "") ? e.stop : null, date: D.test(e.date || "") ? e.date : null };
      if (type === "once" ? !row.date : !row.start) continue;
      if (type === "temp" && (!row.end || row.end < row.start)) continue;
      await c.query(`INSERT INTO app_expenses(name, cat, amount, type, start, "end", stop, date, legacy_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (legacy_id) DO NOTHING`,
        [String(e.name).slice(0, 120), CATS.includes(e.cat) ? e.cat : "أخرى", amount, type, type === "once" ? null : row.start, type === "temp" ? row.end : null, type === "fixed" ? row.stop : null, type === "once" ? row.date : null, Number(e.id) || null]);
      n++;
    }
    const s = db.settings || {};
    const put = (k, v) => c.query("INSERT INTO app_settings(key, value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING", [k, v]);
    if (s.daftraSubdomain && s.daftraApikey) {
      await put("daftra_subdomain", String(s.daftraSubdomain).trim());
      await put("daftra_domain", ["daftra.com", "daftara.com"].includes(s.daftraDomain) ? s.daftraDomain : "daftra.com");
      await put("daftra_key", encrypt(String(s.daftraApikey).trim()));
    }
    if (s.anthropicKey) {
      const k = String(s.anthropicKey).trim();
      await c.query(`INSERT INTO ai_settings(id, provider, base_url, model, api_key_enc, key_hint, updated_by) VALUES(1,'anthropic','',$1,$2,$3,'legacy') ON CONFLICT (id) DO NOTHING`,
        [process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", encrypt(k), `••••${k.slice(-4)}`]);
    }
    await put("legacy_imported", new Date().toISOString());
    await c.query("COMMIT");
    console.log(`legacy import: ${n} expenses${s.daftraApikey ? ", Daftra connection" : ""}${s.anthropicKey ? ", AI key" : ""}`);
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
main().then(() => pool.end()).catch(async e => { console.error("legacy import failed (the app still starts)", e); await pool.end().catch(() => {}); });
