"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Building2, ShieldCheck, Rocket, Handshake,
  ScrollText, Users, Plug, Settings, ChevronRight, LogOut,
  Zap, Bell, Activity, Globe, WandSparkles, Server, SlidersHorizontal,
  FileText, AlertOctagon, Database, BarChart3, GitBranch,
  Cpu, Receipt, Gauge, ShieldAlert, HardDriveDownload, CloudCog, Radar,
} from "lucide-react";

/** Decode the JWT payload (base64) without verifying — display only */
function decodeToken(token: string): { name?: string; email?: string; role?: string; sub?: string } | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const DEFAULT_USER = { initials: "—", name: "Not signed in", email: "", role: "ADMIN" };

function useCurrentUser() {
  const [user, setUser] = useState(DEFAULT_USER);

  useEffect(() => {
    const token = localStorage.getItem("controlcenter_token");
    if (!token) return;
    const claims = decodeToken(token);
    const name = claims?.name || claims?.email?.split("@")[0] || "Admin";
    const email = claims?.email || claims?.sub || "";
    const role = claims?.role || "ADMIN";
    const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    setUser({ initials, name, email, role });
  }, []);

  return user;
}

// Minimum role that can USE the screen (server-enforced); hiding it here just avoids dead-end
// clicks for SUPPORT/VIEWER operators. Ranks: VIEWER < SUPPORT < ADMIN < SUPER_ADMIN.
const ROLE_RANK: Record<string, number> = { VIEWER: 0, SUPPORT: 1, ADMIN: 2, SUPER_ADMIN: 3 };
const ADMIN_ONLY = new Set(["/users", "/integrations", "/settings", "/config", "/database", "/infrastructure"]);

const sections = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/fleet", label: "Fleet Operations", icon: Radar },
    ],
  },
  {
    label: "Lifecycle",
    items: [
      { href: "/setup", label: "New Deployment", icon: WandSparkles },
      { href: "/organizations", label: "Organizations", icon: Building2 },
      { href: "/releases", label: "Releases", icon: Rocket },
      { href: "/deployments", label: "Deployments", icon: Globe },
      // Creates the infrastructure a deployment runs on, as distinct from
      // /deployments, which rolls versions out to an install that already exists.
      { href: "/provisioning", label: "Cloud Provisioning", icon: CloudCog },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/infrastructure", label: "Infrastructure", icon: Server },
      { href: "/config", label: "Configuration", icon: SlidersHorizontal },
      { href: "/database", label: "Database", icon: Database },
      { href: "/logs", label: "Log Viewer", icon: FileText },
      { href: "/health", label: "System Health", icon: Activity },
      { href: "/sla", label: "SLA Dashboard", icon: Gauge },
      { href: "/alerts", label: "Alerts", icon: AlertOctagon },
    ],
  },
  {
    label: "Licensing",
    items: [
      { href: "/licenses", label: "Licenses", icon: ShieldCheck },
      { href: "/compliance", label: "Compliance", icon: ShieldAlert },
      { href: "/partners", label: "Partners", icon: Handshake },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/audit", label: "Audit Trail", icon: ScrollText },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "API Services",
    items: [
      { href: "/shared-services", label: "Service Catalog", icon: Cpu },
      { href: "/shared-services/quotas", label: "Service Quotas", icon: Gauge },
      { href: "/billing", label: "Billing & Invoices", icon: Receipt },
      { href: "/backups", label: "Cloud Backups", icon: HardDriveDownload },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const path = usePathname();
  const user = useCurrentUser();

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <aside className="fixed inset-y-0 left-0 w-[260px] bg-controlcenter-950 text-white flex flex-col z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="w-9 h-9 bg-controlcenter-500 rounded-xl flex items-center justify-center shadow-lg">
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide">ZGATE Control Center</div>
          <div className="text-[10px] text-controlcenter-300 uppercase tracking-widest">Management Portal</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {sections
          .map((section) => ({
            ...section,
            items: section.items.filter(
              (item) => !ADMIN_ONLY.has(item.href) || (ROLE_RANK[user.role] ?? 0) >= ROLE_RANK.ADMIN),
          }))
          .filter((section) => section.items.length > 0)
          .map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-controlcenter-500">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                      active
                        ? "bg-controlcenter-600 text-white shadow-sm"
                        : "text-controlcenter-200 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon
                      size={15}
                      className={cn(
                        "shrink-0",
                        active ? "text-white" : "text-controlcenter-400 group-hover:text-white"
                      )}
                    />
                    <span className="flex-1">{label}</span>
                    {active && <ChevronRight size={11} className="opacity-50" />}
                    {href === "/setup" && !active && (
                      <span className="text-[9px] bg-controlcenter-600 text-white px-1.5 py-0.5 rounded-full font-semibold">
                        NEW
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Git / version tag */}
      <div className="px-4 py-2 border-t border-white/5">
        <div className="flex items-center gap-2 text-[10px] text-controlcenter-600">
          <GitBranch size={10} />
          <span>v1.0.0 · controlcenter/main</span>
        </div>
      </div>

      {/* Bottom user */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 bg-controlcenter-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user.name}</div>
            <div className="text-[10px] text-controlcenter-400 truncate">{user.email}</div>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("controlcenter_token");
            // Clear the middleware cookie too
            document.cookie = "controlcenter_token=; path=/; max-age=0";
            window.location.href = "/login";
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-controlcenter-300
                     hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut size={13} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
