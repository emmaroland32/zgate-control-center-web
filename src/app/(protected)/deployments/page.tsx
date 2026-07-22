"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Rocket, Globe, ArrowRight, CheckCircle2, XCircle, Clock,
  RefreshCw, Terminal, AlertTriangle, ChevronRight, Play, X,
} from "lucide-react";
import { releaseService, deploymentService, organizationService } from "@/services/controlcenter.service";
import type { Deployment, SoftwareRelease, Organization } from "@/types";
import { formatDateTime, timeAgo, cn } from "@/lib/utils";

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
type DeployStatus = Deployment["status"];

const STATUS_META: Record<DeployStatus, { label: string; badgeClass: string; icon: React.ReactNode; pulse: boolean }> = {
  PENDING:     { label: "Pending",     badgeClass: "badge badge-gray",   icon: <Clock size={11} />,       pulse: false },
  IN_PROGRESS: { label: "In Progress", badgeClass: "badge badge-blue",   icon: <RefreshCw size={11} className="animate-spin" />, pulse: true },
  SUCCESS:     { label: "Success",     badgeClass: "badge badge-green",  icon: <CheckCircle2 size={11} />, pulse: false },
  FAILED:      { label: "Failed",      badgeClass: "badge badge-red",    icon: <XCircle size={11} />,     pulse: false },
  ROLLED_BACK: { label: "Rolled Back", badgeClass: "badge badge-yellow", icon: <RefreshCw size={11} />,   pulse: false },
};

function durationLabel(startedAt: string, completedAt?: string): string {
  const end = completedAt ? new Date(completedAt) : new Date();
  const secs = Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

// -------------------------------------------------------
// Push Update Dialog
// -------------------------------------------------------
interface PushDialogProps {
  releases: SoftwareRelease[];
  orgs: Pick<Organization, "id" | "name" | "deployedVersion">[];
  onClose: () => void;
  onPushed: () => void;
}

function PushDialog({ releases, orgs, onClose, onPushed }: PushDialogProps) {
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>(releases[0]?.id ?? "");
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notify, setNotify] = useState(true);
  const [pushing, setPushing] = useState(false);

  const chosenRelease = releases.find((r) => r.id === selectedRelease);

  const toggleOrg = (id: string) => {
    setSelectedOrgs((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  const toggleAll = () => {
    setSelectedOrgs((p) => p.length === orgs.length ? [] : orgs.map((o) => o.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrgs.length === 0) { toast.error("Select at least one organization."); return; }
    if (!selectedRelease) { toast.error("Select a release version."); return; }
    setPushing(true);
    try {
      await deploymentService.pushUpdate({
        organizationIds: selectedOrgs,
        releaseId: selectedRelease,
        scheduledAt: scheduleMode === "scheduled" && scheduledAt ? scheduledAt : null,
        notifyContacts: notify,
      });
      toast.success(`Update queued for ${selectedOrgs.length} organization${selectedOrgs.length > 1 ? "s" : ""}.`);
      onPushed();
    } catch {
      toast.error("Failed to push update.");
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Rocket size={18} className="text-controlcenter-600" />
            <span className="font-semibold text-slate-900">Push Update</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Organization selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Organizations *</label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-controlcenter-600 hover:underline"
              >
                {selectedOrgs.length === orgs.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {orgs.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">No organizations found.</div>
              ) : orgs.map((org) => {
                const checked = selectedOrgs.includes(org.id);
                return (
                  <label
                    key={org.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                      checked ? "bg-controlcenter-50" : "hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOrg(org.id)}
                      className="w-4 h-4 accent-controlcenter-600"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{org.name}</div>
                      <div className="text-xs text-slate-500">Current: v{org.deployedVersion ?? "—"}</div>
                    </div>
                    {checked && <ChevronRight size={14} className="text-controlcenter-500" />}
                  </label>
                );
              })
              }
            </div>
          </div>

          {/* Release version */}
          <div>
            <label className="label">Release Version *</label>
            <select
              className="select"
              value={selectedRelease}
              onChange={(e) => setSelectedRelease(e.target.value)}
            >
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.version} — {r.channel}{r.isLatest ? " (Latest)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Breaking changes warning */}
          {chosenRelease?.breakingChanges && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800">
                <div className="font-semibold mb-0.5">Warning — Breaking Changes in v{chosenRelease.version}</div>
                This release includes breaking changes. Deployment will pause for manual confirmation at each organization.
              </div>
            </div>
          )}

          {/* Schedule */}
          <div>
            <label className="label">Schedule</label>
            <div className="flex gap-3">
              {(["immediate", "scheduled"] as const).map((mode) => (
                <label
                  key={mode}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer flex-1 transition-colors",
                    scheduleMode === mode
                      ? "border-controlcenter-400 bg-controlcenter-50 text-controlcenter-800"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <input
                    type="radio"
                    checked={scheduleMode === mode}
                    onChange={() => setScheduleMode(mode)}
                    className="accent-controlcenter-600"
                  />
                  <span className="text-sm font-medium capitalize">{mode}</span>
                </label>
              ))}
            </div>
            {scheduleMode === "scheduled" && (
              <div className="mt-3">
                <input
                  type="datetime-local"
                  className="input"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Notify toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <div className="text-sm font-medium text-slate-800">Notify organization contacts</div>
              <div className="text-xs text-slate-500">Send email notification before deployment begins</div>
            </div>
            <button
              type="button"
              onClick={() => setNotify((p) => !p)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                notify ? "bg-controlcenter-600" : "bg-slate-200"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                notify ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              {selectedOrgs.length > 0
                ? `${selectedOrgs.length} organization${selectedOrgs.length > 1 ? "s" : ""} selected`
                : "No organizations selected"}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={pushing} className="btn-primary">
                {pushing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                {pushing ? "Pushing..." : "Push Update"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Logs Drawer
// -------------------------------------------------------
function LogsDrawer({ deployment, onClose }: { deployment: Deployment; onClose: () => void }) {
  const meta = STATUS_META[deployment.status];
  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-controlcenter-600" />
            <div>
              <span className="font-semibold text-slate-900">Deployment Logs</span>
              <div className="text-xs text-slate-500 mt-0.5">{deployment.organizationName}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Meta strip */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Version</span>
            <span className="font-mono text-xs font-bold text-slate-800">
              v{deployment.previousVersion} <ArrowRight size={10} className="inline" /> v{deployment.releaseVersion}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className={meta.badgeClass}>{meta.icon}{meta.label}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock size={11} />
            {formatDateTime(deployment.startedAt)}
          </div>
          <div className="text-xs text-slate-500">
            Duration: {durationLabel(deployment.startedAt, deployment.completedAt)}
          </div>
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-y-auto p-5">
          {deployment.logs ? (
            <pre className="font-mono text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-900 text-emerald-400 p-4 rounded-lg">
              {deployment.logs}
              {deployment.status === "IN_PROGRESS" && (
                <span className="inline-block w-2 h-3 bg-emerald-400 ml-1 animate-pulse align-middle" />
              )}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <Terminal size={28} />
              <span className="text-sm">No logs available yet.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// In-Progress Live Card
// -------------------------------------------------------
function InProgressCard({ deployment }: { deployment: Deployment }) {
  const elapsed = durationLabel(deployment.startedAt);
  const progress = Math.min(95, Math.floor((Date.now() - new Date(deployment.startedAt).getTime()) / 600000 * 100));

  return (
    <div className="card p-4 border-l-4 border-controlcenter-500 bg-controlcenter-50/30">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Globe size={14} className="text-controlcenter-600" />
            <span className="font-semibold text-slate-900 text-sm">{deployment.organizationName}</span>
            <span className="badge badge-blue flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" />
              In Progress
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">v{deployment.previousVersion}</span>
            <ArrowRight size={10} />
            <span className="font-mono text-controlcenter-700 font-semibold">v{deployment.releaseVersion}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-slate-500">Started {timeAgo(deployment.startedAt)}</div>
          <div className="text-xs text-slate-500">by {deployment.deployedBy}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Deploying...</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div
            className="bg-controlcenter-500 h-1.5 rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <Clock size={10} />
          Elapsed: {elapsed}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Main Page
// -------------------------------------------------------
export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [releases, setReleases] = useState<SoftwareRelease[]>([]);
  const [orgs, setOrgs] = useState<Pick<Organization, "id" | "name" | "deployedVersion">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [viewLogs, setViewLogs] = useState<Deployment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deps, rels, allOrgs] = await Promise.all([
        deploymentService.getAll(),
        releaseService.getAvailable(),
        organizationService.getAll(),
      ]);
      // Enrich deployments with org names where backend only returns organizationId
      const orgMap = new Map<string, string>(
        (Array.isArray(allOrgs) ? allOrgs : []).map((o: Organization) => [o.id, o.name])
      );
      const enriched = (Array.isArray(deps) ? deps : []).map((d: Deployment) => ({
        ...d,
        organizationName: d.organizationName && d.organizationName !== d.organizationId
          ? d.organizationName
          : (orgMap.get(d.organizationId) ?? d.organizationId),
      }));
      setDeployments(enriched);
      setReleases(Array.isArray(rels) ? rels : []);
      setOrgs(
        (Array.isArray(allOrgs) ? allOrgs : []).map((o: Organization) => ({
          id: o.id,
          name: o.name,
          deployedVersion: o.deployedVersion ?? "—",
        }))
      );
    } catch {
      setDeployments([]);
      setReleases([]);
      setOrgs([]);
      setError("API unavailable. Please ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Stats
  const total = deployments.length;
  const inProgress = deployments.filter((d) => d.status === "IN_PROGRESS").length;
  const failed = deployments.filter((d) => d.status === "FAILED").length;
  const successToday = deployments.filter((d) => {
    if (d.status !== "SUCCESS") return false;
    const today = new Date();
    const completed = d.completedAt ? new Date(d.completedAt) : null;
    return completed && completed.toDateString() === today.toDateString();
  }).length;

  const inProgressDeployments = deployments.filter((d) => d.status === "IN_PROGRESS");

  const handleRollback = async (deployment: Deployment) => {
    if (!confirm(`Roll back ${deployment.organizationName} from v${deployment.releaseVersion} to v${deployment.previousVersion}?`)) return;
    try {
      await deploymentService.rollback(deployment.id);
      toast.success(`Rollback initiated for ${deployment.organizationName}.`);
      load();
    } catch {
      toast.error(`Rollback failed for ${deployment.organizationName}.`);
    }
  };

  const stats = [
    {
      label: "Total Deployments",
      value: total,
      icon: <Globe size={18} className="text-controlcenter-600" />,
      bg: "bg-controlcenter-50",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: <RefreshCw size={18} className={cn("text-blue-600", inProgress > 0 && "animate-spin")} />,
      bg: "bg-blue-50",
    },
    {
      label: "Failed",
      value: failed,
      icon: <XCircle size={18} className="text-red-500" />,
      bg: "bg-red-50",
    },
    {
      label: "Successful Today",
      value: successToday,
      icon: <CheckCircle2 size={18} className="text-emerald-600" />,
      bg: "bg-emerald-50",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Deployments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track and manage software rollouts across all customer organizations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary" title="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowPushDialog(true)} className="btn-primary">
            <Rocket size={14} />
            Push Update
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

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card h-12 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="stat-card">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-2", s.bg)}>
                  {s.icon}
                </div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* In-Progress section */}
          {inProgressDeployments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <h2 className="text-sm font-semibold text-slate-700">
                  In Progress ({inProgressDeployments.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {inProgressDeployments.map((d) => (
                  <InProgressCard key={d.id} deployment={d} />
                ))}
              </div>
            </div>
          )}

          {/* Main table */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">All Deployments</h2>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Deployed By</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400">
                        No deployments found.
                      </td>
                    </tr>
                  ) : (
                    deployments.map((d) => {
                      const meta = STATUS_META[d.status];
                      const canRollback = d.rollbackAvailable && (d.status === "SUCCESS" || d.status === "FAILED");
                      return (
                        <tr key={d.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-controlcenter-100 rounded-md flex items-center justify-center flex-shrink-0">
                                <Globe size={13} className="text-controlcenter-600" />
                              </div>
                              <span className="font-medium text-slate-900">{d.organizationName}</span>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                              <span className="text-slate-500">{d.previousVersion}</span>
                              <ArrowRight size={11} className="text-slate-400" />
                              <span className="font-bold text-slate-800">{d.releaseVersion}</span>
                            </div>
                          </td>
                          <td>
                            <span className={cn(meta.badgeClass, "flex items-center gap-1 w-fit")}>
                              {meta.icon}
                              {meta.label}
                            </span>
                          </td>
                          <td className="text-slate-600 text-xs">{d.deployedBy}</td>
                          <td className="text-slate-500 text-xs">{timeAgo(d.startedAt)}</td>
                          <td className="text-slate-500 text-xs font-mono">
                            {durationLabel(d.startedAt, d.completedAt)}
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setViewLogs(d)}
                                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                                title="View Logs"
                              >
                                <Terminal size={12} />
                                Logs
                              </button>
                              {canRollback && (
                                <button
                                  onClick={() => handleRollback(d)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 rounded-md border border-amber-200 transition-colors"
                                  title="Rollback"
                                >
                                  <RefreshCw size={12} />
                                  Rollback
                                </button>
                              )}
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
        </>
      )}

      {/* Push update dialog */}
      {showPushDialog && (
        <PushDialog
          releases={releases}
          orgs={orgs}
          onClose={() => setShowPushDialog(false)}
          onPushed={() => {
            setShowPushDialog(false);
            load();
          }}
        />
      )}

      {/* Logs drawer */}
      {viewLogs && (
        <LogsDrawer
          deployment={viewLogs}
          onClose={() => setViewLogs(null)}
        />
      )}
    </div>
  );
}
