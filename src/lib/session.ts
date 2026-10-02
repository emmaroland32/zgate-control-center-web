import { OPERATOR_COOKIE, bffHeaders } from "@/lib/bff";

/**
 * The signed-in operator, as the pages see them.
 *
 * The token used to be in `localStorage`, and every page that wanted to know who was signed in
 * decoded it. Now the token is httpOnly and the pages read these claims instead — set beside it by
 * src/app/api/cc-session, unsigned and display-only. Nothing here is a security control: the backend
 * decides what an operator may do on every single request, which is why handing the page its own role
 * costs nothing.
 */
export type Operator = { email: string; role: string };

const NO_OPERATOR: Operator = { email: "", role: "" };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/** Who is signed in, or blanks. Blanks render as least privilege, which is the right way to fail. */
export function readOperator(): Operator {
  try {
    const raw = readCookie(OPERATOR_COOKIE);
    if (!raw) return NO_OPERATOR;
    const parsed = JSON.parse(raw) as Partial<Operator>;
    return { email: String(parsed.email ?? ""), role: String(parsed.role ?? "") };
  } catch {
    return NO_OPERATOR;
  }
}

/**
 * End the session and leave for the sign-in page.
 *
 * A full navigation, not a router push: everything on screen was rendered for an operator who is no
 * longer signed in, and the point is to drop that state rather than keep it in memory behind a new
 * page. Never throws — if the logout call cannot be made the cookie may survive, but the operator
 * still ends up at the sign-in page rather than stuck on a dead screen.
 */
export async function endSession(redirectTo = "/login"): Promise<void> {
  try {
    await fetch("/api/cc-session/logout", { method: "POST", headers: bffHeaders() });
  } catch {
    // The redirect below is what the operator asked for; the cookie expires on its own.
  }
  if (typeof window !== "undefined") window.location.href = redirectTo;
}
