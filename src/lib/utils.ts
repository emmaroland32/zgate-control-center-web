import { type ClassValue, clsx } from "clsx";
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
 * The signed-in operator as the JWT describes them (display/gating only — the server enforces).
 * The role claim is the Spring authority (`ROLE_ADMIN`); it is normalised here so callers can
 * compare against the plain role names the API uses everywhere else.
 */
export function getCurrentUser(): CurrentUser {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("controlcenter_token") : null;
    if (!token) return { email: "", role: "" };
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json);
    const raw = String(claims?.role ?? "").replace(/^ROLE_/, "");
    const role = (["SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"].includes(raw) ? raw : "") as CurrentUser["role"];
    return { email: claims?.email || claims?.sub || "", role };
  } catch {
    return { email: "", role: "" };
  }
}

export const ROLE_RANK: Record<string, number> = { VIEWER: 0, SUPPORT: 1, ADMIN: 2, SUPER_ADMIN: 3 };

/** Get the current user's email from the JWT token in localStorage */
export function getCurrentUserEmail(): string {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("controlcenter_token") : null;
    if (!token) return "system";
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json);
    return claims?.email || claims?.sub || "system";
  } catch {
    return "system";
  }
}
