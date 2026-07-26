/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Rocket, Tag, Package, CheckCircle2, XCircle, AlertTriangle,
  GitBranch, Clock, ArrowRight, RefreshCw, Eye,
  Shield, X,
} from "lucide-react";
import { releaseService, apiError } from "@/services/controlcenter.service";
import type { SoftwareRelease, ReleaseChannel } from "@/types";
import { formatDateTime, cn, getCurrentUserEmail } from "@/lib/utils";

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
const CHANNEL_META: Record<ReleaseChannel, { label: string; badgeClass: string; color: string; description: string }> = {
  STABLE: {
    label: "STABLE",
    badgeClass: "badge badge-green",
    color: "emerald",
    description: "Production-ready releases. Recommended for all deployments.",
  },
  LTS: {
    label: "LTS",
    badgeClass: "badge badge-blue",
    color: "blue",
    description: "Long-term support. Security patches for 24 months.",
  },
  BETA: {
    label: "BETA",
    badgeClass: "badge badge-purple",
    color: "purple",
    description: "Feature-complete preview. Not recommended for production.",
  },
  HOTFIX: {
    label: "HOTFIX",
    badgeClass: "badge badge-red",
    color: "red",
    description: "Critical patch for a specific issue. Apply immediately.",
  },
};

type Tab = "releases" | "channels";
type ChannelFilter = "ALL" | ReleaseChannel;

const ALL_MODULES = ["core", "portfolio", "mutual-fund", "compliance", "audit", "crm", "recon", "risk", "trade", "treasury", "fincon"];

// -------------------------------------------------------
// Publish Dialog
// -------------------------------------------------------
interface PublishDialogProps {
  onClose: () => void;
  onPublished: (r: SoftwareRelease) => void;
}

function PublishDialog({ onClose, onPublished }: PublishDialogProps) {
  const [form, setForm] = useState({
    version: "",
    channel: "STABLE" as ReleaseChannel,
    dockerTag: "",
    dockerRegistry: "registry.zgate.io",
    releaseNotes: "",
    breakingChanges: false,
    requiredMigrations: "",
    modules: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const toggleModule = (m: string) => {
    set("modules", form.modules.includes(m)
      ? form.modules.filter((x) => x !== m)
      : [...form.modules, m]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.version || !form.dockerTag) {
      toast.error("Version and Docker Tag are required.");
      return;
    }
    setSaving(true);
    try {
      // Backend CreateReleaseRequest expects hasBreakingChanges + migrations (JSON string).
      const payload = {
        version: form.version,
        channel: form.channel,
        dockerTag: form.dockerTag,
        dockerRegistry: form.dockerRegistry,
        releaseNotes: form.releaseNotes,
        hasBreakingChanges: form.breakingChanges,
        migrations: JSON.stringify(
          form.requiredMigrations.split("\n").map((s) => s.trim()).filter(Boolean),
        ),
        publishedAt: new Date().toISOString(),
        publishedBy: getCurrentUserEmail(),
        isLatest: false,
      };
      const created = await releaseService.create(payload);
      onPublished(created);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Dialog header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Rocket size={18} className="text-controlcenter-600" />
            <span className="font-semibold text-slate-900">Publish New Release</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Version + Channel */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Version *</label>
              <input
                className="input"
                placeholder="e.g. 2.4.1"
                value={form.version}
                onChange={(e) => set("version", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Channel *</label>
              <select className="select" value={form.channel} onChange={(e) => set("channel", e.target.value as ReleaseChannel)}>
                <option value="STABLE">STABLE</option>
                <option value="LTS">LTS</option>
                <option value="BETA">BETA</option>
                <option value="HOTFIX">HOTFIX</option>
              </select>
            </div>
          </div>

          {/* Docker Tag + Registry */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Docker Tag *</label>
              <input
                className="input font-mono text-xs"
                placeholder="e.g. zgate/backend:2.4.1"
                value={form.dockerTag}
                onChange={(e) => set("dockerTag", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Docker Registry</label>
              <input
                className="input font-mono text-xs"
                placeholder="registry.zgate.io"
                value={form.dockerRegistry}
                onChange={(e) => set("dockerRegistry", e.target.value)}
              />
            </div>
          </div>

          {/* Release Notes */}
          <div>
            <label className="label">Release Notes</label>
            <textarea
              className="input resize-none"
              rows={4}
              placeholder="Describe what changed in this release..."
              value={form.releaseNotes}
              onChange={(e) => set("releaseNotes", e.target.value)}
            />
          </div>

          {/* Breaking Changes toggle */}
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600" />
              <div>
                <div className="text-sm font-medium text-amber-900">Breaking Changes</div>
                <div className="text-xs text-amber-700">Deployments will require manual approval before proceeding</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => set("breakingChanges", !form.breakingChanges)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                form.breakingChanges ? "bg-amber-500" : "bg-slate-200"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                form.breakingChanges ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          {/* Required Migrations */}
          <div>
            <label className="label">Required Migrations (one per line)</label>
            <textarea
              className="input font-mono text-xs resize-none"
              rows={3}
              placeholder={"V2_4_1__add_nav_history.sql\nV2_4_1__index_orders.sql"}
              value={form.requiredMigrations}
              onChange={(e) => set("requiredMigrations", e.target.value)}
            />
          </div>

          {/* Affected Modules */}
          <div>
            <label className="label">Affected Modules</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ALL_MODULES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    form.modules.includes(m)
                      ? "bg-controlcenter-600 text-white border-controlcenter-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-controlcenter-400"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Rocket size={14} />
              )}
              {saving ? "Publishing..." : "Publish Release"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Release Notes Drawer
// -------------------------------------------------------
function ReleaseNotesDrawer({ release, onClose }: { release: SoftwareRelease; onClose: () => void }) {
  const meta = CHANNEL_META[release.channel];
  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-controlcenter-600" />
            <span className="font-semibold text-slate-900">Release Notes</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Version heading */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-bold text-slate-900">v{release.version}</span>
              <span className={meta.badgeClass}>{meta.label}</span>
              {release.isLts && <span className="badge badge-blue">LTS</span>}
              {release.isLatest && <span className="badge badge-green">Latest</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {formatDateTime(release.publishedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Shield size={11} />
                {release.publishedBy}
              </span>
            </div>
          </div>

          {/* Docker info */}
          <div className="bg-slate-900 rounded-lg p-3 space-y-1">
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Docker</div>
            <div className="font-mono text-xs text-emerald-400">{release.dockerRegistry}/{release.dockerTag}</div>
          </div>

          {/* Breaking changes warning */}
          {release.breakingChanges && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800">
                <div className="font-semibold mb-0.5">Breaking Changes Included</div>
                Upgrading requires manual review and approval before deployment proceeds.
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Changelog</div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{release.releaseNotes}</p>
          </div>

          {/* Migrations */}
          {release.requiredMigrations.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Required Migrations</div>
              <div className="space-y-1">
                {release.requiredMigrations.map((m) => (
                  <div key={m} className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 rounded-md">
                    <GitBranch size={12} className="text-controlcenter-500" />
                    <span className="font-mono text-xs text-slate-700">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modules */}
          {release.modules.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Affected Modules</div>
              <div className="flex flex-wrap gap-1.5">
                {release.modules.map((m) => (
                  <span key={m} className="px-2 py-0.5 bg-controlcenter-50 text-controlcenter-700 text-xs rounded-full border border-controlcenter-200">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Main Page
// -------------------------------------------------------
export default function ReleasesPage() {
  const [releases, setReleases] = useState<SoftwareRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("releases");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL");
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [viewRelease, setViewRelease] = useState<SoftwareRelease | null>(null);
  const [channelPins, setChannelPins] = useState<Record<ReleaseChannel, boolean>>({
    STABLE: false, LTS: true, BETA: false, HOTFIX: false,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await releaseService.getAll();
      setReleases(data);
    } catch (e) {
      setReleases([]);
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const latestRelease = releases.find((r) => r.isLatest) ?? releases[0];

  const filtered = channelFilter === "ALL"
    ? releases
    : releases.filter((r) => r.channel === channelFilter);

  const handleApprove = async (id: string) => {
    try {
      await releaseService.approve(id);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const handleReject = async (id: string) => {
    try {
      await releaseService.reject(id);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  // Rollouts happen from the Deployments page (which selects orgs + calls push-update). This button
  // previously only toasted "queued" without calling anything, so route to the real flow.
  const handleDeploy = (r: SoftwareRelease) => {
    toast.message(`Roll out v${r.version} from the Deployments page.`);
    window.location.assign("/deployments");
  };

  const togglePin = (channel: ReleaseChannel) => {
    setChannelPins((p) => ({ ...p, [channel]: !p[channel] }));
    toast.success(`Channel ${channel} ${channelPins[channel] ? "unpinned" : "pinned"}.`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Software Releases</h1>
          <p className="text-sm text-slate-500 mt-0.5">Publish and manage ZGATE versions across all customer deployments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary" title="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowPublishDialog(true)} className="btn-primary">
            <Rocket size={14} />
            Publish Release
          </button>
        </div>
      </div>

      {/* API error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card h-14 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {/* Latest release banner */}
          {latestRelease && (
            <div className="rounded-xl bg-gradient-to-r from-controlcenter-600 to-controlcenter-800 p-5 text-white shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Rocket size={22} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xl font-bold">v{latestRelease.version}</span>
                      <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">Current Stable</span>
                      {latestRelease.breakingChanges && (
                        <span className="px-2 py-0.5 bg-amber-400/30 text-amber-100 rounded-full text-xs font-medium flex items-center gap-1">
                          <AlertTriangle size={11} />
                          Breaking Changes
                        </span>
                      )}
                    </div>
                    <div className="text-controlcenter-200 text-sm flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Tag size={12} />
                        <span className="font-mono">{latestRelease.dockerTag}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatDateTime(latestRelease.publishedAt)}
                      </span>
                    </div>
                    <p className="text-controlcenter-200 text-xs mt-2 max-w-xl leading-relaxed line-clamp-2">
                      {latestRelease.releaseNotes}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 flex flex-col gap-2">
                  <button
                    onClick={() => handleDeploy(latestRelease)}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-controlcenter-700 text-sm font-semibold rounded-lg hover:bg-controlcenter-50 transition-colors"
                  >
                    <Rocket size={14} />
                    Deploy to All
                  </button>
                  <button
                    onClick={() => setViewRelease(latestRelease)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/20 transition-colors"
                  >
                    <Eye size={14} />
                    View Notes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200">
            {(["releases", "channels"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
                  activeTab === t
                    ? "border-controlcenter-600 text-controlcenter-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {t === "releases" ? "Releases" : "Channels"}
              </button>
            ))}
          </div>

          {/* ---- Releases Tab ---- */}
          {activeTab === "releases" && (
            <div className="space-y-4">
              {/* Channel filter */}
              <div className="flex items-center gap-1">
                {(["ALL", "STABLE", "LTS", "BETA", "HOTFIX"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setChannelFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      channelFilter === f
                        ? "bg-controlcenter-100 text-controlcenter-700 border border-controlcenter-200"
                        : "text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {f === "ALL" ? "All" : f}
                    {f !== "ALL" && (
                      <span className="ml-1.5 text-[10px] opacity-70">
                        ({releases.filter((r) => r.channel === f).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Channel</th>
                      <th>Docker Tag</th>
                      <th>Published By</th>
                      <th>Published At</th>
                      <th>Breaking</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-slate-400">
                          No releases in this channel.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((r) => {
                        const meta = CHANNEL_META[r.channel];
                        return (
                          <tr key={r.id}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">v{r.version}</span>
                                {r.isLatest && <span className="badge badge-green text-[10px]">Latest</span>}
                                {r.isLts && <span className="badge badge-blue text-[10px]">LTS</span>}
                              </div>
                            </td>
                            <td>
                              <span className={meta.badgeClass}>{meta.label}</span>
                            </td>
                            <td>
                              <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                                {r.dockerTag}
                              </span>
                            </td>
                            <td className="text-slate-600">{r.publishedBy}</td>
                            <td className="text-slate-500 text-xs">{formatDateTime(r.publishedAt)}</td>
                            <td>
                              {r.breakingChanges ? (
                                <span className="badge badge-yellow flex items-center gap-1">
                                  <AlertTriangle size={11} />
                                  Yes
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setViewRelease(r)}
                                  className="p-1.5 hover:bg-slate-100 rounded-md transition-colors"
                                  title="View Notes"
                                >
                                  <Eye size={14} className="text-slate-500" />
                                </button>
                                <button
                                  onClick={() => handleDeploy(r)}
                                  className="p-1.5 hover:bg-controlcenter-50 rounded-md transition-colors"
                                  title="Deploy"
                                >
                                  <Rocket size={14} className="text-controlcenter-600" />
                                </button>
                                <button
                                  onClick={() => handleApprove(r.id)}
                                  className="p-1.5 hover:bg-emerald-50 rounded-md transition-colors"
                                  title="Approve"
                                >
                                  <CheckCircle2 size={14} className="text-emerald-600" />
                                </button>
                                <button
                                  onClick={() => handleReject(r.id)}
                                  className="p-1.5 hover:bg-red-50 rounded-md transition-colors"
                                  title="Reject"
                                >
                                  <XCircle size={14} className="text-red-500" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Channels Tab ---- */}
          {activeTab === "channels" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(["STABLE", "LTS", "BETA", "HOTFIX"] as ReleaseChannel[]).map((channel) => {
                const meta = CHANNEL_META[channel];
                const channelReleases = releases.filter((r) => r.channel === channel);
                const latest = channelReleases.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
                const info = {
                  version: latest?.version ?? "—",
                  deployments: channelReleases.length,
                  lastUpdated: latest?.publishedAt ?? "",
                };
                const pinned = channelPins[channel];

                const borderColor = {
                  STABLE: "border-emerald-200",
                  LTS:    "border-blue-200",
                  BETA:   "border-purple-200",
                  HOTFIX: "border-red-200",
                }[channel];

                const iconBg = {
                  STABLE: "bg-emerald-100",
                  LTS:    "bg-blue-100",
                  BETA:   "bg-purple-100",
                  HOTFIX: "bg-red-100",
                }[channel];

                const iconColor = {
                  STABLE: "text-emerald-600",
                  LTS:    "text-blue-600",
                  BETA:   "text-purple-600",
                  HOTFIX: "text-red-600",
                }[channel];

                return (
                  <div key={channel} className={cn("card p-5 border-l-4", borderColor)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", iconBg)}>
                          <GitBranch size={16} className={iconColor} />
                        </div>
                        <div>
                          <span className={meta.badgeClass}>{meta.label}</span>
                          <div className="text-xs text-slate-500 mt-0.5">{meta.description}</div>
                        </div>
                      </div>
                      {pinned && (
                        <span className="badge badge-blue text-[10px]">Pinned</span>
                      )}
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Current Version</span>
                        <span className="font-mono text-sm font-bold text-slate-900">v{info.version}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Deployments on Channel</span>
                        <span className="text-sm font-semibold text-slate-700">{info.deployments}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Last Updated</span>
                        <span className="text-xs text-slate-600">{formatDateTime(info.lastUpdated)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => togglePin(channel)}
                      className={cn(
                        "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors",
                        pinned
                          ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                      )}
                    >
                      <Shield size={12} />
                      {pinned ? "Unpin Channel" : "Pin Channel"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Publish dialog */}
      {showPublishDialog && (
        <PublishDialog
          onClose={() => setShowPublishDialog(false)}
          onPublished={(r) => {
            setReleases((prev) => [r, ...prev]);
            setShowPublishDialog(false);
          }}
        />
      )}

      {/* Release notes drawer */}
      {viewRelease && (
        <ReleaseNotesDrawer
          release={viewRelease}
          onClose={() => setViewRelease(null)}
        />
      )}
    </div>
  );
}
