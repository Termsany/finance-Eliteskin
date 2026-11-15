import { NextResponse, type NextRequest } from "next/server";

/** Everything needs the session cookie except the login page, its API and the health check. The routes verify the signature. */
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const open = p === "/login" || p.startsWith("/api/auth/") || p === "/api/health";
  if (open || req.cookies.get("ef_session")?.value) return NextResponse.next();
  if (p.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
