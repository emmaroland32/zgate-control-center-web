/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Radar, Rocket, Pause, Play, XCircle, ChevronDown, ChevronRight,
  AlertTriangle, ArrowUpCircle, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
  fleetService, releaseService, provisioningService, apiError,
  FleetOverview, FleetRollout, FleetRolloutItem, FleetStackSummary,
} from "@/services/controlcenter.service";

type Release = { id: string; version: string; channel: string; approvalStatus?: string; isLatest?: boolean };

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");

const rolloutBadge = (s: FleetRollout["status"]) =>
  s === "COMPLETED" ? "badge badge-green"
  : s === "IN_PROGRESS" ? "badge badge-blue"
  : s === "PENDING" ? "badge badge-gray"
  : s === "PAUSED" ? "badge badge-yellow"
  : "badge badge-red";

const itemBadge = (s: FleetRolloutItem["status"]) =>
  s === "SUCCEEDED" ? "badge badge-green"
  : s === "FAILED" ? "badge badge-red"
  : s === "SKIPPED" ? "badge badge-gray"
  : s === "PENDING" ? "badge badge-gray"
  : s === "SOAKING" ? "badge badge-purple"
  : "badge badge-blue";

const stackBadge = (s: string) =>
  s === "ACTIVE" ? "badge badge-green"
  : s === "FAILED" ? "badge badge-red"
  : s === "DRIFTED" ? "badge badge-yellow"
  : s === "DESTROYED" ? "badge badge-gray"
  : "badge badge-blue";

export default function FleetPage() {
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [rollouts, setRollouts] = useState<FleetRollout[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, FleetRolloutItem[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const load = useCallback(() => {
    fleetService.overview().then(setOverview).catch((e) => toast.error(apiError(e)));
    fleetService.rollouts().then(setRollouts).catch(() => setRollouts([]));
  }, []);

  useEffect(() => {
    load();
    releaseService.getAll().then((r: any) => setReleases(r)).catch(() => setReleases([]));
  }, [load]);

  // Live rollouts change on the orchestrator's schedule — keep the view honest while one runs.
  const hasLive = rollouts.some((r) => r.status === "IN_PROGRESS" || r.status === "PENDING");
  useEffect(() => {
    if (!hasLive) return;
    const t = setInterval(() => {
      load();
      if (expanded) {
        fleetService.rollout(expanded)
          .then((d) => setItems((m) => ({ ...m, [expanded]: d.items })))
          .catch(() => {});
      }
    }, 10000);
    return () => clearInterval(t);
  }, [hasLive, expanded, load]);

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    fleetService.rollout(id)
      .then((d) => setItems((m) => ({ ...m, [id]: d.items })))
      .catch((e) => toast.error(apiError(e)));
  };

  async function control(id: string, action: "pause" | "resume" | "cancel" | "approve") {
    try {
      if (action === "pause") await fleetService.pauseRollout(id);
      if (action === "resume") await fleetService.resumeRollout(id);
      if (action === "cancel") await fleetService.cancelRollout(id);
      if (action === "approve") await fleetService.approveRollout(id);
      load();
      if (expanded === id) fleetService.rollout(id).then((d) => setItems((m) => ({ ...m, [id]: d.items }))).catch(() => {});
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function upgradeOne(stack: FleetStackSummary) {
    setUpgrading(stack.stackId);
    try {
      await provisioningService.upgrade(stack.stackId);
      load();
    } catch (e) {
      toast.error(apiError(e, "Upgrade could not start"));
    } finally {
      setUpgrading(null);
    }
  }

  const behindCount = useMemo(() => {
    if (!overview?.latestRelease) return 0;
    return overview.stacks.filter(
      (s) => s.status === "ACTIVE" && s.releaseVersion && s.releaseVersion !== overview.latestRelease
    ).length;
  }, [overview]);

  const orgStatus = overview?.orgsByStatus ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Radar className="h-6 w-6 text-controlcenter-600" /> Fleet Operations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Every customer deployment at a glance — health, versions, backups, subscriptions — and staged
            rollouts that upgrade the fleet one canary-led wave at a time.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-1" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button className="btn-primary flex items-center gap-1" onClick={() => setShowCreate(true)}>
            <Rocket className="h-4 w-4" /> New Rollout
          </button>
        </div>
      </div>

      {/* Health tiles */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Organizations" value={overview?.totalOrgs ?? "—"} />
        <Stat label="Healthy" value={orgStatus.HEALTHY ?? 0} tone="text-emerald-600" />
        <Stat label="Degraded" value={orgStatus.DEGRADED ?? 0} tone="text-amber-600" />
        <Stat label="Offline" value={orgStatus.OFFLINE ?? 0} tone="text-red-600" />
        <Stat label="Latest release" value={overview?.latestRelease ?? "—"} />
        <Stat label="Stacks behind" value={behindCount} tone={behindCount ? "text-amber-600" : undefined} />
      </div>

      {overview && overview.serviceKeyEnforced === false && (
        <div className="card p-4 border-red-200 bg-red-50/60 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Machine-to-machine auth is not enforced</span> — telemetry,
            license-bundle fetch and pull-token accept an org UUID alone. Confirm every instance has its
            service key configured, then set <code className="font-mono">CONTROLCENTER_SERVICE_KEY_ENFORCE=true</code>.
          </span>
        </div>
      )}

      {/* Needs attention */}
      {overview && (overview.subscriptionsLapsingSoon.length > 0 || overview.backups.some((b) => b.stale)) && (
        <div className="card p-5 border-amber-200 bg-amber-50/50">
          <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Needs attention
          </h2>
          <div className="mt-2 grid md:grid-cols-2 gap-4 text-sm">
            {overview.subscriptionsLapsingSoon.length > 0 && (
              <div>
                <div className="font-medium text-slate-700 mb-1">Subscriptions lapsing</div>
                {overview.subscriptionsLapsingSoon.map((s) => (
                  <div key={s.organizationId} className="flex justify-between py-0.5">
                    <Link className="text-controlcenter-600 hover:underline" href={`/organizations/${s.organizationId}`}>
                      {s.orgName}
                    </Link>
                    <span className={s.lapsed ? "text-red-600 font-medium" : "text-slate-500"}>
                      {s.lapsed ? "LAPSED" : fmtDate(s.validUntil)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {overview.backups.some((b) => b.stale) && (
              <div>
                <div className="font-medium text-slate-700 mb-1">Stale backups</div>
                {overview.backups.filter((b) => b.stale).map((b) => (
                  <div key={b.organizationId} className="flex justify-between py-0.5">
                    <span>{b.orgName ?? b.orgSlug}</span>
                    <span className="text-red-600">{b.lastSuccessfulBackupAt ? `last ${fmtDate(b.lastSuccessfulBackupAt)}` : "never"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Margin per customer */}
      {overview && (overview.margins?.length ?? 0) > 0 && (
        <div className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Margin per customer</h2>
          <p className="text-xs text-slate-400 mb-3">
            Monthly subscription fee minus month-to-date infrastructure cost — margin overstates until month end
            (vendor-hosted stacks; from the cloud provider&apos;s cost API, grouped by the
            zgate:org-id tag).{!overview.costTrackingEnabled && " Cost tracking is OFF — set COST_TRACKING_ENABLED=true to ingest costs."}
          </p>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Organization</th><th>Monthly fee</th><th>Infra cost (month-to-date)</th><th>Margin (MTD)</th></tr>
              </thead>
              <tbody>
                {overview.margins!.map((m) => (
                  <tr key={m.organizationId}>
                    <td className="font-medium">{m.orgName}</td>
                    <td>{m.monthlyFee == null ? "—" : `$${Number(m.monthlyFee).toFixed(2)}`}</td>
                    <td>{m.currentMonthCost == null ? "—" : `$${Number(m.currentMonthCost).toFixed(2)}`}</td>
                    <td className={m.margin == null ? "text-slate-400"
                        : Number(m.margin) < 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                      {m.margin == null ? "—" : `$${Number(m.margin).toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rollouts */}
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Rollouts</h2>
        {rollouts.length === 0 && (
          <p className="text-sm text-slate-500">
            No rollouts yet. A rollout upgrades many stacks to one release in waves — a small canary first,
            soak-verified by telemetry, halting the moment anything fails.
          </p>
        )}
        <div className="space-y-2">
          {rollouts.map((r) => (
            <div key={r.id} className="border border-slate-200 rounded-lg">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                onClick={() => toggleExpand(r.id)}
              >
                {expanded === r.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-medium text-slate-900">→ {r.releaseVersion}</span>
                <span className={rolloutBadge(r.status)}>{r.status}</span>
                <span className="text-xs text-slate-500">
                  wave {r.currentWave} · canary {r.canarySize} · wave size {r.waveSize} ·{" "}
                  {r.autoApply ? `auto-apply, soak ${r.soakMinutes}m` : "manual apply"} · by {r.createdBy}
                </span>
                {r.approvalStatus === "PENDING" && (
                  <span className="badge badge-purple">AWAITING APPROVAL</span>
                )}
                <span className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {r.approvalStatus === "PENDING" && r.status !== "CANCELLED" && r.status !== "FAILED" && (
                    <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => control(r.id, "approve")}
                            title="Four-eyes: must be a different operator than the creator">
                      Approve
                    </button>
                  )}
                  {(r.status === "IN_PROGRESS" || r.status === "PENDING") && (
                    <button className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1" onClick={() => control(r.id, "pause")}>
                      <Pause className="h-3 w-3" /> Pause
                    </button>
                  )}
                  {r.status === "PAUSED" && (
                    <button className="btn-primary !py-1 !px-2 text-xs flex items-center gap-1" onClick={() => control(r.id, "resume")}>
                      <Play className="h-3 w-3" /> Resume
                    </button>
                  )}
                  {(r.status === "IN_PROGRESS" || r.status === "PENDING" || r.status === "PAUSED") && (
                    <button className="btn-danger !py-1 !px-2 text-xs flex items-center gap-1" onClick={() => control(r.id, "cancel")}>
                      <XCircle className="h-3 w-3" /> Cancel
                    </button>
                  )}
                </span>
              </div>
              {r.statusReason && (
                <div className="px-4 pb-2 text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {r.statusReason}
                </div>
              )}
              {expanded === r.id && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <RolloutItems items={items[r.id] ?? []} stacks={overview?.stacks ?? []} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stacks */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Stacks</h2>
          <Link href="/provisioning" className="text-sm text-controlcenter-600 hover:underline">
            Provisioning →
          </Link>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Organization</th><th>Env</th><th>Target</th><th>Version</th>
                <th>Status</th><th>Last applied</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(overview?.stacks ?? []).map((s) => {
                const behind = overview?.latestRelease && s.releaseVersion
                  && s.releaseVersion !== overview.latestRelease && s.status === "ACTIVE";
                return (
                  <tr key={s.stackId}>
                    <td className="font-medium">{s.orgName ?? s.orgSlug ?? s.organizationId}</td>
                    <td>{s.environment}</td>
                    <td>{s.target}</td>
                    <td>
                      <span className={behind ? "badge badge-yellow" : "badge badge-gray"}>
                        {s.releaseVersion ?? "?"}
                      </span>
                    </td>
                    <td>
                      <span className={stackBadge(s.status)}>{s.status}</span>
                      {s.driftDetected && <span className="badge badge-yellow ml-1">DRIFT</span>}
                    </td>
                    <td className="text-xs text-slate-500">{fmtDate(s.lastAppliedAt)}</td>
                    <td>
                      {behind && (
                        <button
                          className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1"
                          disabled={upgrading === s.stackId}
                          onClick={() => upgradeOne(s)}
                          title="Plan an upgrade to this org's latest entitled release; review and apply in Provisioning"
                        >
                          <ArrowUpCircle className="h-3 w-3" />
                          {upgrading === s.stackId ? "Planning…" : "Upgrade"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(overview?.stacks ?? []).length === 0 && (
                <tr><td colSpan={7} className="text-center text-sm text-slate-400 py-6">No stacks provisioned yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateRolloutDialog
          releases={releases}
          stacks={overview?.stacks ?? []}
          latestRelease={overview?.latestRelease ?? null}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${tone ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function RolloutItems({ items, stacks }: { items: FleetRolloutItem[]; stacks: FleetStackSummary[] }) {
  const stackById = useMemo(() => new Map(stacks.map((s) => [s.stackId, s])), [stacks]);
  if (items.length === 0) return <p className="text-sm text-slate-400">Loading…</p>;
  const waves = [...new Set(items.map((i) => i.wave))].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      {waves.map((w) => (
        <div key={w}>
          <div className="text-xs font-semibold text-slate-500 mb-1">
            {w === 0 ? "Wave 0 — canary" : `Wave ${w}`}
          </div>
          <div className="space-y-1">
            {items.filter((i) => i.wave === w).map((i) => {
              const s = stackById.get(i.stackId);
              return (
                <div key={i.id} className="flex items-center gap-3 text-sm">
                  <span className={itemBadge(i.status)}>{i.status}</span>
                  <span className="font-medium">{s ? `${s.orgName ?? s.orgSlug} / ${s.environment}` : i.stackId}</span>
                  <span className="text-xs text-slate-500">{i.fromVersion ?? "?"} → {i.toVersion}</span>
                  {i.appliedAt && <span className="text-xs text-slate-400">applied {fmtDate(i.appliedAt)}</span>}
                  {i.errorMessage && <span className="text-xs text-amber-700 truncate max-w-md" title={i.errorMessage}>{i.errorMessage}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateRolloutDialog({ releases, stacks, latestRelease, onClose, onCreated }: {
  releases: Release[];
  stacks: FleetStackSummary[];
  latestRelease: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const approved = releases.filter((r) => (r.approvalStatus ?? "APPROVED") === "APPROVED");
  const [releaseId, setReleaseId] = useState<string>(
    approved.find((r) => r.version === latestRelease)?.id ?? approved[0]?.id ?? "");
  const [canarySize, setCanarySize] = useState(1);
  const [waveSize, setWaveSize] = useState(5);
  const [autoApply, setAutoApply] = useState(false);
  const [soakMinutes, setSoakMinutes] = useState(15);
  const [submitting, setSubmitting] = useState(false);

  const targetVersion = approved.find((r) => r.id === releaseId)?.version;
  const upgradable = stacks.filter(
    (s) => s.status !== "DESTROYED" && s.lastAppliedAt && targetVersion && s.releaseVersion !== targetVersion);

  async function submit() {
    if (!releaseId) { toast.error("Pick a release"); return; }
    setSubmitting(true);
    try {
      await fleetService.createRollout({ releaseId, canarySize, waveSize, autoApply, soakMinutes });
      onCreated();
    } catch (e) {
      toast.error(apiError(e, "Could not create the rollout"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Rocket className="h-5 w-5 text-controlcenter-600" /> New fleet rollout
        </h2>

        <div>
          <label className="text-xs font-medium text-slate-500">Release</label>
          <select className="select mt-1 w-full" value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
            {approved.map((r) => (
              <option key={r.id} value={r.id}>
                {r.version} ({r.channel}){r.version === latestRelease ? " — latest" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Canary size</label>
            <input type="number" min={1} className="input mt-1 w-full" value={canarySize}
                   onChange={(e) => setCanarySize(Math.max(1, +e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Wave size</label>
            <input type="number" min={1} className="input mt-1 w-full" value={waveSize}
                   onChange={(e) => setWaveSize(Math.max(1, +e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Soak (minutes)</label>
            <input type="number" min={0} className="input mt-1 w-full" value={soakMinutes}
                   onChange={(e) => setSoakMinutes(Math.max(0, +e.target.value))} />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
          <span>
            <span className="font-medium">Auto-apply</span> — each wave plans AND applies unattended, then
            soaks. Unchecked, every stack stops at a reviewed plan and an operator applies it from Provisioning.
          </span>
        </label>

        <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
          {targetVersion
            ? `${upgradable.length} stack(s) need ${targetVersion}. Wave 0 is a ${canarySize}-stack canary; the rollout halts on any failure and (with auto-apply) advances only after each upgraded org heartbeats on the new version.`
            : "Pick a release to see how many stacks it affects."}
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={submitting || !releaseId || upgradable.length === 0} onClick={submit}>
            {submitting ? "Creating…" : `Create rollout (${upgradable.length} stacks)`}
          </button>
        </div>
      </div>
    </div>
  );
}
