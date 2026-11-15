import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * One owner login. The password is the one changed from the settings page (stored as a scrypt hash),
 * or APP_PASSWORD from the server environment until it is changed. Sessions are HMAC-signed cookies.
 */
const scrypt = promisify(scryptCb) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
export const COOKIE = "ef_session";
const MAX_AGE = 60 * 60 * 24 * 14; // two weeks
const secret = () => process.env.SESSION_SECRET || process.env.DATABASE_URL || "dev-secret-change-me";
const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Changing the password bumps its version, which signs out every other device. */
export async function newToken() {
  const v = (await getSetting("password_version")) || "0";
  const body = Buffer.from(JSON.stringify({ t: Date.now(), v })).toString("base64url");
  return `${body}.${mac(body)}`;
}
export async function verifyToken(token: string | undefined) {
  if (!token || !token.includes(".")) return false;
  const [body, m] = token.split(".");
  if (!eq(m, mac(body))) return false;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { t: number; v: string };
    return Date.now() - p.t < MAX_AGE * 1000 && p.v === ((await getSetting("password_version")) || "0");
  } catch { return false; }
}
export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE, secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1" };

export async function hashPassword(pw: string) { const salt = randomBytes(16); const h = await scrypt(pw, salt, 64); return `scrypt$${salt.toString("base64")}$${h.toString("base64")}`; }
export async function checkPassword(pw: string) {
  if (!pw) return false;
  const stored = await getSetting("password_hash");
  if (stored) { const [, s, h] = stored.split("$"); const got = await scrypt(pw, Buffer.from(s, "base64"), 64); return eq(got.toString("base64"), h); }
  const env = process.env.APP_PASSWORD || "";
  return !!env && env !== "change-me-strong-password" && eq(pw, env);
}
export async function changePassword(pw: string) {
  await setSetting("password_hash", await hashPassword(pw));
  await setSetting("password_version", String(Date.now()));
}

export type SessionUser = { id: string; name: string; role: "admin"; manager?: boolean };
/** The signed-in owner, or null. Same shape as the CRM's so the shared routes stay identical. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const c = await cookies();
  return (await verifyToken(c.get(COOKIE)?.value)) ? { id: "owner", name: "المالك", role: "admin" } : null;
}
