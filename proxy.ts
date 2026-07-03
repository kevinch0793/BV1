// Next 16 renamed `middleware` -> `proxy`. Optimistic auth guard only: verifies
// the session cookie's HMAC signature + expiry (no DB) and redirects anonymous
// requests to /login. Authoritative ownership/role/status checks live in the
// data layer (lib/auth, lib/owner). The "already logged in -> leave /login"
// bounce is done in the auth pages (via getCurrentClient) to avoid redirect
// loops when a cookie is validly signed but the client is rejected/expired.
import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const AUTH_PAGES = ["/login", "/register"];

function hasValidSession(token: string | undefined): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  try {
    const expected = createHmac("sha256", secret).update(body).digest();
    const got = Buffer.from(sig, "base64url");
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof p?.exp === "number" && p.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const authed = hasValidSession(request.cookies.get("session")?.value);
  const isAuthPage = AUTH_PAGES.includes(request.nextUrl.pathname);
  if (!authed && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Guard everything except Next internals, static assets, the print page, the
  // export API (both reachable by cookieless headless-Chrome PDF rendering), and
  // the application-answer API (token-authed, called cross-origin by the extension).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|print/|api/export/|api/answer|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
