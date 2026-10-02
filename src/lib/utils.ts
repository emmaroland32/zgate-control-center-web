import { type ClassValue, clsx } from "clsx";
import { readOperator } from "@/lib/session";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

export function timeAgo(date: string | Date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

export type CurrentUser = { email: string; role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER" | "" };

/**
 * The signed-in operator (display/gating only — the server enforces).
 *
 * Read from the operator cookie rather than by decoding the token, which the page can no longer see:
 * see src/lib/session.ts. The role arrives as the Spring authority (`ROLE_ADMIN`) and is normalised
 * here so callers can compare against the plain role names the API uses everywhere else.
 */
export function getCurrentUser(): CurrentUser {
  const operator = readOperator();
  const raw = operator.role.replace(/^ROLE_/, "");
  const role = (["SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"].includes(raw) ? raw : "") as CurrentUser["role"];
  return { email: operator.email, role };
}

export const ROLE_RANK: Record<string, number> = { VIEWER: 0, SUPPORT: 1, ADMIN: 2, SUPER_ADMIN: 3 };

/** The current operator's email, for the "changed by" fields. "system" when there is no session. */
export function getCurrentUserEmail(): string {
  return readOperator().email || "system";
}
