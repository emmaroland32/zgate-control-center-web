import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The SSO callback runs BEFORE a token exists — the whole point of it is to obtain one. Without
// it here the middleware bounces the operator back to /login and the code is never exchanged.
const PUBLIC_PATHS = ["/login", "/sso/callback"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  // Exact match or a real sub-path — startsWith alone would also exempt /loginX and
  // /sso/callback-anything.
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("controlcenter_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Protect all routes except static assets, _next internals, and API routes
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
