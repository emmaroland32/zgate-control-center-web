import { NextRequest, NextResponse } from "next/server";
import { OPERATOR_COOKIE, SESSION_COOKIE } from "@/lib/bff";
import { bffError, callBackend, downstream, rejectCrossSite, upstreamHeaders } from "@/server/bff/cc-proxy";

/*
 * Where an operator's session begins and ends.
 *
 * Sign-in is the one exchange the BFF cannot simply proxy: the backend answers it with a token, and
 * the whole point of the BFF is that the token must not reach the browser. So these routes make the
 * call server-side and keep the token in an httpOnly cookie; the page gets back only the operator's
 * email and role.
 *
 * Two cookies are set, and the difference matters:
 *   controlcenter_token — httpOnly. The credential. Readable by the middleware and this server only.
 *   controlcenter_user  — readable by the page, and deliberately worthless: the email and role, for
 *                         deciding what to draw. The backend enforces authority on every request.
 *
 * `/api/v1/auth/login` and `/api/v1/auth/oidc/callback` are refused through the proxy, so this is the
 * only way to reach them.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_MAX_AGE = 24 * 60 * 60; // as before: a day, then sign in again
const useSecureCookies = (process.env.CC_PUBLIC_URL ?? process.env.NEXTAUTH_URL ?? "").startsWith("https://");

type Params = { params: Promise<{ action: string }> };

/** The operator, as the backend described them. No token. */
type Issued = { token?: string; email?: string; role?: string };

function setSession(res: NextResponse, issued: Issued) {
  const common = { path: "/", sameSite: "strict" as const, secure: useSecureCookies, maxAge: SESSION_MAX_AGE };
  res.cookies.set(SESSION_COOKIE, issued.token ?? "", { ...common, httpOnly: true });
  // Not httpOnly on purpose: the sidebar and the role gates read it while rendering, and it grants
  // nothing. Keeping the role here rather than decoding the token in the page is what lets the token
  // be httpOnly at all.
  res.cookies.set(OPERATOR_COOKIE, JSON.stringify({ email: issued.email ?? "", role: issued.role ?? "" }), {
    ...common,
    httpOnly: false,
  });
}

function clearSession(res: NextResponse) {
  const common = { path: "/", sameSite: "strict" as const, secure: useSecureCookies, maxAge: 0 };
  res.cookies.set(SESSION_COOKIE, "", { ...common, httpOnly: true });
  res.cookies.set(OPERATOR_COOKIE, "", { ...common, httpOnly: false });
}

/**
 * Hand the sign-in to the backend and keep the token here.
 *
 * A refusal is passed through exactly as the backend wrote it — same status, same body — because the
 * sign-in page reads its codes: MFA_REQUIRED turns on the code field, ACCOUNT_LOCKED says retrying
 * now only extends the backoff. Rewriting them would turn every refusal into "something went wrong".
 */
async function openSession(req: NextRequest, backendPath: string, body: string): Promise<NextResponse> {
  const headers = upstreamHeaders(req);
  headers.set("content-type", "application/json");
  // The backend rate-limits sign-in by client IP. upstreamHeaders forwards x-forwarded-for as it
  // arrives, so a deployment MUST have a proxy in front of Next that appends the real client address
  // — otherwise every operator shares one bucket of ten attempts a minute. (Same requirement the
  // ZGATE dashboard's BFF already has.)
  const upstream = await callBackend(backendPath, { method: "POST", headers, body });
  if (upstream instanceof NextResponse) return upstream;

  if (!upstream.ok) return downstream(upstream);

  const payload = (await upstream.json().catch(() => null)) as { data?: Issued } | Issued | null;
  // Controller responses come wrapped in { code, message, data }; unwrap if it is.
  const issued: Issued | null = payload && typeof payload === "object"
    ? ((payload as { data?: Issued }).data ?? (payload as Issued))
    : null;
  if (!issued?.token) {
    return bffError(502, "NO_SESSION", "The server did not return a session. Please try again.");
  }

  const res = NextResponse.json({ email: issued.email ?? "", role: issued.role ?? "" });
  setSession(res, issued);
  // The backend clears its own SSO state cookie on the callback; let that reach the browser.
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) {
    if (cookie.startsWith("cc_sso_state=")) res.headers.append("set-cookie", cookie);
  }
  return res;
}

export async function POST(req: NextRequest, { params }: Params) {
  const refused = rejectCrossSite(req);
  if (refused) return refused;

  const { action } = await params;
  const raw = await req.text();

  if (action === "login") {
    return openSession(req, "/api/v1/auth/login", raw || "{}");
  }
  if (action === "sso") {
    // The code and state are useless without the backend's own httpOnly cc_sso_state cookie, which
    // upstreamHeaders carries up: that is what binds this exchange to this browser.
    return openSession(req, "/api/v1/auth/oidc/callback", raw || "{}");
  }
  if (action === "logout") {
    // The backend has no sign-out endpoint, so this is all there is: the cookie goes, and with it the
    // only copy of the token. The token itself stays valid until it expires — worth knowing, and worth
    // fixing on the backend rather than pretending here.
    const res = NextResponse.json({ ok: true });
    clearSession(res);
    return res;
  }
  return bffError(404, "NOT_FOUND", "Not found.");
}
