/** Background jobs while the server runs: sync with Daftra (hourly) and a once-a-day local backup of the app's data. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { syncIfStale } = await import("@/lib/daftra");
  const { backupIfDue } = await import("@/lib/backup-disk");
  const minutes = Math.max(15, Number(process.env.SYNC_EVERY_MINUTES) || 60);
  const tick = () => {
    void syncIfStale(minutes).catch(e => console.error("scheduled daftra sync", e));
    void backupIfDue().catch(e => console.error("scheduled backup", e));
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 10 * 60_000);
}
