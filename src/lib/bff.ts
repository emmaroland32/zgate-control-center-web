/**
 * Header every request from Control Center's pages to /api/cc carries.
 *
 * The browser holds no operator token: the BFF (src/server/bff/cc-proxy.ts) attaches it from the
 * httpOnly session cookie. Because a cookie goes along with requests another site triggers too, the
 * BFF refuses a state-changing request without this header, which a cross-origin page cannot add
 * without a CORS preflight the server never grants.
 *
 * Same header name as the ZGATE dashboard's (web/src/lib/bff.ts) so the apps read alike.
 */
export const CSRF_HEADER = "x-zgate-csrf";

export function bffHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { [CSRF_HEADER]: "1", ...extra };
}

/** Where the signed-in operator's non-secret display claims live. See src/lib/session.ts. */
export const OPERATOR_COOKIE = "controlcenter_user";

/** The session cookie middleware gates on, and the only place the operator's token exists. */
export const SESSION_COOKIE = "controlcenter_token";
