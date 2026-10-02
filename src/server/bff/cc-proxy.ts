import { NextRequest, NextResponse } from "next/server";
import { CSRF_HEADER, SESSION_COOKIE } from "@/lib/bff";

/*
 * Backend-for-frontend for Control Center.
 *
 * The browser never holds the operator token. It lives in the httpOnly `controlcenter_token` cookie,
 * and every /api/cc/... call the browser makes arrives here, where the token is read from that cookie
 * and attached before the request goes on to the Control Center backend.
 *
 * It used to live in `localStorage` AND in a JavaScript-readable cookie, with an axios interceptor
 * reading it out and setting the Bearer in the page. Any script in the page — an XSS payload, a
 * compromised dependency — could take it and reuse it from anywhere, for as long as it lasted. This is
 * the console that provisions and tears down customer deployments, so that token is worth more than
 * most.
 *
 * Because the browser now authenticates with a cookie, a state-changing request must also prove it
 * came from our own pages (see rejectCrossSite). A bearer header needed no such check.
 *
 * The backend decides everything else: status, body and error codes pass through unchanged, so the
 * pages keep reading the `{ code, message, data }` envelope and the step-up and lockout codes exactly
 * as they did.
 */

/**
 * Where the backend is, from the SERVER's point of view — which is not where it was from the
 * browser's.
 *
 * `CC_BACKEND_URL` is read at request time, so it is set per deployment and should be the internal
 * address (in compose, `http://controlcenter-backend:8090`). `NEXT_PUBLIC_API_URL` is only a fallback
 * for running the app straight from a checkout, and a poor one in a container: Next inlines
 * `NEXT_PUBLIC_*` at build time, and the value baked in is the address the BROWSER uses, which from
 * inside the container usually reaches nothing. Set CC_BACKEND_URL anywhere the two differ.
 */
const BACKEND_URL = process.env.CC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8090";
const TIMEOUT_MS = 5 * 60 * 1000; // long enough for a provisioning run or a report export

/** Request headers the backend reads. Anything else the browser sends stays here. */
const FORWARD_REQUEST_HEADERS = ["accept", "accept-language", "content-type", "user-agent",
  "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-stepup-ticket"];

/**
 * Response headers the browser needs. `x-api-envelope` matters: the API client uses it to recognise
 * the backend's `{ code, message, data }` wrapper and surface the backend's own success message.
 */
const FORWARD_RESPONSE_HEADERS = ["content-type", "content-disposition", "content-length",
  "cache-control", "etag", "last-modified", "location", "retry-after", "www-authenticate",
  "x-api-envelope", "x-ratelimit-limit", "x-ratelimit-remaining"];

/**
 * The backend's own cookie for an in-flight SSO sign-in: it binds the OIDC state to this browser, so
 * it has to travel in both directions. It is the only cookie that crosses this boundary.
 */
const SSO_COOKIE = "cc_sso_state";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** An error written here, in the backend's coded shape, so apiError() finds a message as usual. */
function bffError(status: number, code: string, message: string) {
  return NextResponse.json({ status, code, message, timestamp: new Date().toISOString() }, { status });
}

/** A state change has to prove it came from our own pages, not from a cookie another site rode. */
export function rejectCrossSite(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== host) {
      return bffError(403, "CSRF_REJECTED", "This request did not come from Control Center and was refused.");
    }
  }
  if (req.headers.get(CSRF_HEADER) !== "1") {
    return bffError(403, "CSRF_REJECTED", "This request did not come from Control Center and was refused.");
  }
  return null;
}

/*
 * Backend endpoints that answer with a token. Only the session routes call them, server-side; through
 * the proxy they would hand the browser the very token this file exists to keep from it.
 */
const TOKEN_ISSUING = [/^\/api\/v1\/auth\/login$/, /^\/api\/v1\/auth\/oidc\/callback$/];

/** Build the request to send upstream: allowed headers, the session's bearer, the SSO cookie. */
export function upstreamHeaders(req: NextRequest, token?: string): Headers {
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);
  const sso = req.cookies.get(SSO_COOKIE)?.value;
  if (sso) headers.set("cookie", `${SSO_COOKIE}=${sso}`);
  return headers;
}

/** Copy the headers and the one cookie the browser is allowed back out of an upstream response. */
export function downstream(upstream: Response): NextResponse {
  const headers = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const res = new NextResponse(upstream.body, { status: upstream.status, headers });
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) {
    if (cookie.startsWith(`${SSO_COOKIE}=`)) res.headers.append("set-cookie", cookie);
  }
  return res;
}

/** Call the backend, turning the two ways it can fail to answer into the backend's error shape. */
export async function callBackend(path: string, init: RequestInit): Promise<Response | NextResponse> {
  try {
    return await fetch(`${BACKEND_URL}${path}`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return timedOut
      ? bffError(504, "BACKEND_TIMEOUT", "The server took too long to respond. Please try again.")
      : bffError(502, "BACKEND_UNAVAILABLE", "The server is temporarily unavailable. Please try again shortly.");
  }
}

export { bffError };

/** Forward `req` to the backend at the path its segments spell out. */
export async function proxyToBackend(req: NextRequest, segments: string[]): Promise<NextResponse> {
  // Each segment arrives decoded. "." and ".." would be resolved away by the URL parser, and a "/"
  // inside one would add a level, either of which could reach a path the route did not expose.
  if (segments.some((s) => s === "." || s === ".." || s.includes("/") || s.includes("\\"))) {
    return bffError(400, "BAD_PATH", "The request path is not valid.");
  }
  const backendPath = `/${segments.map(encodeURIComponent).join("/")}`;
  if (TOKEN_ISSUING.some((re) => re.test(backendPath.toLowerCase()))) {
    return bffError(404, "NOT_FOUND", "Not found.");
  }

  const refused = rejectCrossSite(req);
  if (refused) return refused;

  // No session is not an error here: the SSO status and authorize calls are made before one exists,
  // and the backend answers anything else with its own 401, which the API client turns into a
  // sign-out.
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const hasBody = !SAFE_METHODS.has(req.method) && req.body !== null;

  const upstream = await callBackend(`${backendPath}${req.nextUrl.search}`, {
    method: req.method,
    headers: upstreamHeaders(req, token),
    body: hasBody ? req.body : undefined,
    // Stream uploads through instead of buffering them here.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
  if (upstream instanceof NextResponse) return upstream;

  return downstream(upstream);
}
