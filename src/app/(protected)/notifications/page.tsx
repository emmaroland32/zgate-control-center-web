"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Bell, BellOff, Check, X, Filter, Shield, Rocket, Building2,
  Activity, Lock, AlertTriangle, CheckCircle2, XCircle, ShieldAlert,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { alertService } from "@/services/nexus.service";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType =
  | "LICENSE_EXPIRY"
  | "DEPLOYMENT_SUCCESS"
  | "DEPLOYMENT_FAILED"
  | "HEALTH_ALERT"
  | "NEW_ORGANIZATION"
  | "SECURITY_ALERT"
  | "RELEASE_PUBLISHED";

type FilterType = "all" | "unread" | "alerts" | "license" | "deployments" | "health";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
}

// ─── Map backend alerts to notification type ────────────────────────────────

function severityToType(severity: string, title: string): NotificationType {
  const lower = title.toLowerCase();
  if (lower.includes("license") || lower.includes("expir")) return "LICENSE_EXPIRY";
  if (lower.includes("deploy") && lower.includes("fail")) return "DEPLOYMENT_FAILED";
  if (lower.includes("deploy")) return "DEPLOYMENT_SUCCESS";
  if (lower.includes("security") || lower.includes("login") || lower.includes("api key")) return "SECURITY_ALERT";
  if (lower.includes("release") || lower.includes("publish")) return "RELEASE_PUBLISHED";
  if (lower.includes("onboard") || lower.includes("new org")) return "NEW_ORGANIZATION";
  if (severity === "CRITICAL" || severity === "HIGH") return "HEALTH_ALERT";
  return "HEALTH_ALERT";
}

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, {
  icon: React.ReactNode;
  borderColor: string;
  iconBg: string;
  iconColor: string;
}> = {
  LICENSE_EXPIRY: {
    icon: <ShieldAlert size={15} />,
    borderColor: "border-l-amber-400",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  DEPLOYMENT_SUCCESS: {
    icon: <CheckCircle2 size={15} />,
    borderColor: "border-l-emerald-400",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
  DEPLOYMENT_FAILED: {
    icon: <XCircle size={15} />,
    borderColor: "border-l-red-400",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
  },
  HEALTH_ALERT: {
    icon: <Activity size={15} />,
    borderColor: "border-l-orange-400",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
  NEW_ORGANIZATION: {
    icon: <Building2 size={15} />,
    borderColor: "border-l-blue-400",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
  SECURITY_ALERT: {
    icon: <Lock size={15} />,
    borderColor: "border-l-red-500",
    iconBg: "bg-red-100",
    iconColor: "text-red-700",
  },
  RELEASE_PUBLISHED: {
    icon: <Rocket size={15} />,
    borderColor: "border-l-purple-400",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
  },
};

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTER_TYPES: Record<FilterType, NotificationType[] | null> = {
  all: null,
  unread: null,
  alerts: ["HEALTH_ALERT", "SECURITY_ALERT", "DEPLOYMENT_FAILED"],
  license: ["LICENSE_EXPIRY"],
  deployments: ["DEPLOYMENT_SUCCESS", "DEPLOYMENT_FAILED"],
  health: ["HEALTH_ALERT"],
};

// ─── Date grouping ────────────────────────────────────────────────────────────

function getGroup(timestamp: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "Earlier";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    setLoading(true);
    alertService.getAll()
      .then((alerts: Array<{ id: string; title: string; message: string; severity: string; status: string; firedAt: string; acknowledgedAt?: string }>) => {
        const mapped: Notification[] = (Array.isArray(alerts) ? alerts : []).map((a) => ({
          id: a.id,
          type: severityToType(a.severity, a.title),
          title: a.title,
          description: a.message || "",
          timestamp: a.firedAt,
          read: a.status === "ACKNOWLEDGED" || a.status === "RESOLVED",
        }));
        setNotifications(mapped);
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.read);
    const types = FILTER_TYPES[filter];
    if (types) return notifications.filter((n) => types.includes(n.type));
    return notifications;
  }, [notifications, filter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<"Today" | "Yesterday" | "Earlier", Notification[]> = {
      Today: [], Yesterday: [], Earlier: [],
    };
    for (const n of filtered) {
      groups[getGroup(n.timestamp)].push(n);
    }
    return groups;
  }, [filtered]);

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const FILTERS: { key: FilterType; label: string; icon?: React.ReactNode }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "alerts", label: "Alerts", icon: <AlertTriangle size={12} /> },
    { key: "license", label: "License", icon: <Shield size={12} /> },
    { key: "deployments", label: "Deployments", icon: <Rocket size={12} /> },
    { key: "health", label: "Health", icon: <Activity size={12} /> },
  ];

  const GROUP_ORDER: ("Today" | "Yesterday" | "Earlier")[] = ["Today", "Yesterday", "Earlier"];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900">Notifications</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-nexus-600 text-white text-[10px] font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5">
                <Check size={13} />
                Mark All Read
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-4xl">

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 mr-1">
            <Filter size={13} />
            Filter:
          </span>
          {FILTERS.map(({ key, label, icon }) => {
            const count = key === "unread"
              ? unreadCount
              : key === "all"
                ? notifications.length
                : (FILTER_TYPES[key] ?? []).reduce((acc, t) => acc + notifications.filter((n) => n.type === t).length, 0);

            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === key
                    ? "bg-nexus-600 border-nexus-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-nexus-300 hover:text-nexus-700"
                }`}
              >
                {icon}
                {label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[1.1rem] h-4 rounded-full text-[10px] font-bold px-1 ${
                    filter === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification list */}
        {filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <BellOff size={32} className="text-slate-300 mx-auto mb-3" />
            <div className="text-sm font-medium text-slate-500">No notifications</div>
            <div className="text-xs text-slate-400 mt-1">
              {filter === "unread" ? "All caught up!" : "Nothing to show for this filter."}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {GROUP_ORDER.map((group) => {
              const items = grouped[group];
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{group}</span>
                    <span className="flex-1 border-t border-slate-200" />
                    <span className="text-xs text-slate-400">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((n) => {
                      const cfg = TYPE_CONFIG[n.type];
                      return (
                        <div
                          key={n.id}
                          onClick={() => !n.read && markRead(n.id)}
                          className={`card border-l-4 ${cfg.borderColor} px-4 py-3.5 flex items-start gap-3.5 cursor-pointer transition-all ${
                            !n.read ? "bg-white shadow-sm" : "bg-slate-50/80"
                          }`}
                        >
                          {/* Icon */}
                          <span className={`w-8 h-8 rounded-xl ${cfg.iconBg} ${cfg.iconColor} flex items-center justify-center shrink-0 mt-0.5`}>
                            {cfg.icon}
                          </span>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-sm ${n.read ? "text-slate-600" : "font-semibold text-slate-900"}`}>
                                {n.title}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                {!n.read && (
                                  <span className="w-2 h-2 rounded-full bg-nexus-500 shrink-0" title="Unread" />
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                                  className="text-slate-300 hover:text-slate-500 transition-colors"
                                  title="Dismiss"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.description}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[11px] text-slate-400">{timeAgo(n.timestamp)}</span>
                              <span className={`badge text-[10px] ${
                                n.type === "LICENSE_EXPIRY" ? "badge-yellow" :
                                n.type === "DEPLOYMENT_SUCCESS" ? "badge-green" :
                                n.type === "DEPLOYMENT_FAILED" ? "badge-red" :
                                n.type === "HEALTH_ALERT" ? "badge-yellow" :
                                n.type === "NEW_ORGANIZATION" ? "badge-blue" :
                                n.type === "SECURITY_ALERT" ? "badge-red" :
                                "badge-purple"
                              }`}>
                                {n.type.replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer link */}
        {notifications.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-xs text-slate-400 border-t border-slate-200 pt-4">
            <span>{notifications.length} total &bull; {unreadCount} unread</span>
            <Link href="/settings?tab=notifications" className="flex items-center gap-1.5 text-nexus-600 hover:text-nexus-700 font-medium">
              <Bell size={12} />
              Notification Settings
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
