import { getSetting, setSetting } from "@/lib/settings";
import { riyadhToday } from "@/lib/finance";

/** The Riyadh hour right now (0–23). */
function riyadhHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(new Date()));
}

/**
 * Once a day, after the configured hour, POST the briefing text to the owner's webhook (Slack/Discord/any gateway).
 * Keyed by date so it fires once; safe to call every few minutes. No webhook set = nothing happens.
 */
export async function pushBriefingIfDue() {
  const url = (await getSetting("briefing_webhook"))?.trim();
  if (!url || !/^https:\/\//.test(url)) return;
  const hour = Math.min(23, Math.max(0, Number(await getSetting("briefing_hour")) || 8));
  const today = riyadhToday();
  if (await getSetting("briefing_last_sent") === today) return;   // already sent today
  if (riyadhHour() < hour) return;                                 // too early
  const { buildTodayBriefing } = await import("@/app/api/admin/briefing/route");
  const b = await buildTodayBriefing();
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: b.text, content: b.text, title: b.title }), signal: AbortSignal.timeout(15000) });
    // mark sent only on success, so a transient failure retries on the next tick
    if (r.ok) await setSetting("briefing_last_sent", today);
    else console.error("briefing push", r.status);
  } catch (e) { console.error("briefing push", e); }
}
