"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Cpu,
  Activity,
  Globe,
  RefreshCw,
} from "lucide-react";
import { organizationService, licenseService, deploymentService } from "@/services/controlcenter.service";
import type { Organization, License, Deployment } from "@/types";
import { formatDateTime, timeAgo } from "@/lib/utils";

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      organizationService.getById(id),
      licenseService.getByOrg(id).catch(() => [] as License[]),
      deploymentService.getByOrg(id).catch(() => [] as Deployment[]),
    ])
      .then(([o, ls, ds]) => {
        setOrg(o);
        setLicenses(Array.isArray(ls) ? ls : []);
        setDeployments(Array.isArray(ds) ? ds : []);
      })
      .catch(() => setError("Could not load tenant. Backend may be unavailable."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-12 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="p-6">
        <Link href="/organizations" className="btn-secondary mb-4 inline-flex">
          <ChevronLeft size={14} /> Back to Organizations
        </Link>
        <div className="card p-6 text-sm text-rose-700 bg-rose-50 border border-rose-200">
          {error ?? "Tenant not found."}
        </div>
      </div>
    );
  }

  const activeLicenses = licenses.filter((l) => l.status === "ACTIVE").length;
  const lastDeploy = deployments[0];

  return (
    <div className="p-6 space-y-6">
      <Link
        href="/organizations"
        className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
      >
        <ChevronLeft size={12} /> Back to Organizations
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-controlcenter-100 rounded-lg flex items-center justify-center">
            <Building2 size={22} className="text-controlcenter-600" />
          </div>
          <div>
            <h1 className="page-title">{org.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {org.slug} · {org.environment} · {org.tier}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
              {org.contactEmail && (
                <span className="inline-flex items-center gap-1">
                  <Mail size={11} /> {org.contactEmail}
                </span>
              )}
              {org.contactPhone && (
                <span className="inline-flex items-center gap-1">
                  <Phone size={11} /> {org.contactPhone}
                </span>
              )}
              {org.country && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {org.country}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
              org.status === "HEALTHY"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : org.status === "DEGRADED"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : org.status === "OFFLINE"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                org.status === "HEALTHY"
                  ? "bg-emerald-500"
                  : org.status === "DEGRADED"
                    ? "bg-amber-500"
                    : org.status === "OFFLINE"
                      ? "bg-rose-500"
                      : "bg-slate-400"
              }`}
            />
            {org.status}
          </span>
          <Link href={`/licenses?organization=${org.id}`} className="btn-secondary text-xs">
            Manage Licences
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 mb-2">
            <Globe size={18} className="text-blue-600" />
          </div>
          <div className="stat-value font-mono text-base">v{org.deployedVersion ?? "—"}</div>
          <div className="stat-label">Deployed Version</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 mb-2">
            <ShieldCheck size={18} className="text-emerald-600" />
          </div>
          <div className="stat-value">{activeLicenses}</div>
          <div className="stat-label">Active Licences</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 mb-2">
            <Cpu size={18} className="text-amber-600" />
          </div>
          <div className="stat-value">{org.licensedModules?.length ?? 0}</div>
          <div className="stat-label">Modules Enabled</div>
        </div>
        <div className="stat-card">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-50 mb-2">
            <Activity size={18} className="text-purple-600" />
          </div>
          <div className="stat-value">{org.activeUsers ?? 0}</div>
          <div className="stat-label">Active Users</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Connection</h2>
          </div>
          <dl className="text-sm divide-y divide-slate-100">
            <div className="px-5 py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Backend URL</dt>
              <dd className="font-mono text-xs break-all text-right">{org.backendUrl || "—"}</dd>
            </div>
            <div className="px-5 py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Last seen</dt>
              <dd className="text-slate-700">{org.lastSeen ? timeAgo(org.lastSeen) : "—"}</dd>
            </div>
            <div className="px-5 py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Deployment type</dt>
              <dd className="text-slate-700">{org.deploymentType ?? "—"}</dd>
            </div>
            <div className="px-5 py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Created</dt>
              <dd className="text-slate-700">{org.createdAt ? formatDateTime(org.createdAt) : "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Licensed Modules</h2>
          </div>
          <div className="p-5">
            {org.licensedModules?.length ? (
              <div className="flex flex-wrap gap-2">
                {org.licensedModules.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-xs text-slate-700"
                  >
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No modules licensed.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Recent Deployments</h2>
          {lastDeploy && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <RefreshCw size={11} /> Last: v{lastDeploy.releaseVersion} {timeAgo(lastDeploy.startedAt)}
            </span>
          )}
        </div>
        {deployments.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            No deployment history.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 text-left">
              <tr>
                <th className="px-5 py-2">Version</th>
                <th className="px-5 py-2">Status</th>
                <th className="px-5 py-2">Deployed By</th>
                <th className="px-5 py-2">Started</th>
                <th className="px-5 py-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {deployments.slice(0, 10).map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-mono text-xs">
                    v{d.previousVersion} → <span className="font-bold">v{d.releaseVersion}</span>
                  </td>
                  <td className="px-5 py-3 text-xs">{d.status}</td>
                  <td className="px-5 py-3 text-slate-600">{d.deployedBy}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{timeAgo(d.startedAt)}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {d.completedAt ? timeAgo(d.completedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
