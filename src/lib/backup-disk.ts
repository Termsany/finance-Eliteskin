import { mkdir, writeFile, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildBackup } from "@/lib/backup";

/** Where nightly backups land. BACKUP_DIR (a mounted volume in production) or ./backups. */
const DIR = process.env.BACKUP_DIR || join(process.cwd(), "backups");
const KEEP = 14;

/** Writes one dated backup file (with secrets, since it stays on the server) and prunes to the last KEEP. */
export async function writeNightlyBackup() {
  await mkdir(DIR, { recursive: true });
  const backup = await buildBackup(true);
  const name = `elite-finance-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  await writeFile(join(DIR, name), JSON.stringify(backup), "utf8");
  const files = (await readdir(DIR)).filter(f => f.startsWith("elite-finance-") && f.endsWith(".json")).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) await unlink(join(DIR, f)).catch(() => {});
  return name;
}

/** Runs a backup if the newest one on disk is older than ~20 hours (so once a day is enough, whenever the server is up). */
export async function backupIfDue() {
  try {
    await mkdir(DIR, { recursive: true });
    const files = (await readdir(DIR)).filter(f => f.startsWith("elite-finance-") && f.endsWith(".json"));
    let newest = 0;
    for (const f of files) { const s = await stat(join(DIR, f)).catch(() => null); if (s) newest = Math.max(newest, s.mtimeMs); }
    if (Date.now() - newest > 20 * 3600_000) await writeNightlyBackup();
  } catch (e) { console.error("nightly backup", e); }
}
