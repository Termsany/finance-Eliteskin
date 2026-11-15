/** Background sync with Daftra while the server runs (the page also syncs when the data is older than an hour). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { syncIfStale } = await import("@/lib/daftra");
  const minutes = Math.max(15, Number(process.env.SYNC_EVERY_MINUTES) || 60);
  const tick = () => { void syncIfStale(minutes).catch(e => console.error("scheduled daftra sync", e)); };
  setTimeout(tick, 30_000);
  setInterval(tick, 10 * 60_000);
}
