import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildBackup } from "@/lib/backup";

/** Downloads a full backup of the app's own data as JSON (Daftra data re-syncs, so it isn't included).
 *  Encrypted secrets are left out of this browser copy. */
export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const backup = await buildBackup(false);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="elite-finance-backup-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
