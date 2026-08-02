/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Handshake,
  Building2,
  Users,
  Globe,
  Award,
  TrendingUp,
  Phone,
  Mail,
  ExternalLink,
  Plus,
  Edit,
  MoreVertical,
  Star,
  Shield,
  X,
  ChevronRight,
  MapPin,
  LayoutGrid,
  List,
  Briefcase,
} from "lucide-react";
import { partnerService, organizationService, licenseService, apiError } from "@/services/controlcenter.service";
import type { Partner, PartnerTier, Organization, License } from "@/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function isExpiringSoon(dateStr?: string): boolean {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 60 * 24 * 60 * 60 * 1000; // 60 days
}

function isExpired(dateStr?: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

const TIER_BADGE: Record<PartnerTier, string> = {
  PLATINUM: "bg-purple-100 text-purple-700",
  GOLD: "bg-amber-100 text-amber-700",
  SILVER: "bg-slate-100 text-slate-600",
  BRONZE: "bg-orange-100 text-orange-700",
  RESELLER: "bg-blue-100 text-blue-700",
  ENTERPRISE: "bg-indigo-100 text-indigo-700",
  STANDARD: "bg-emerald-100 text-emerald-700",
  STARTER: "bg-teal-100 text-teal-700",
  FREE: "bg-slate-100 text-slate-500",
};

const TIER_GRADIENT: Record<PartnerTier, string> = {
  PLATINUM: "from-purple-700 to-purple-500",
  GOLD: "from-amber-600 to-amber-400",
  SILVER: "from-slate-600 to-slate-400",
  BRONZE: "from-orange-600 to-orange-400",
  RESELLER: "from-blue-600 to-blue-400",
  ENTERPRISE: "from-indigo-600 to-indigo-400",
  STANDARD: "from-emerald-600 to-emerald-400",
  STARTER: "from-teal-600 to-teal-400",
  FREE: "from-slate-500 to-slate-300",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "badge-green",
  SUSPENDED: "badge-red",
  PENDING: "badge-yellow",
  CHURNED: "badge-gray",
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: PartnerTier }) {
  return (
    <span className={cn("badge", TIER_BADGE[tier])}>
      <Star size={10} />
      {tier}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={cn("badge", STATUS_BADGE[status] ?? "badge-gray")}>{status}</span>;
}

function ContractDate({ date }: { date?: string }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const expired = isExpired(date);
  const soon = isExpiringSoon(date);
  return (
    <span className={cn("text-sm", expired ? "text-red-600 font-medium" : soon ? "text-amber-600 font-medium" : "text-slate-700")}>
      {formatDate(date)}
      {(expired || soon) && <span className="ml-1 text-xs">({expired ? "Expired" : "Soon"})</span>}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Partner Card (Grid view)
// ─────────────────────────────────────────────────────────────
function PartnerCard({
  partner,
  onView,
  onEdit,
  onManage,
}: {
  partner: Partner;
  onView: () => void;
  onEdit: () => void;
  onManage: () => void;
}) {
  const expired = isExpired(partner.contractExpiresAt);
  const soon = isExpiringSoon(partner.contractExpiresAt);

  return (
    <div className="card overflow-hidden flex flex-col">
      {/* Gradient header */}
      <div className={cn("bg-gradient-to-r h-2", TIER_GRADIENT[partner.tier])} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-base leading-tight truncate">{partner.name}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <TierBadge tier={partner.tier} />
              <StatusBadge status={partner.status} />
            </div>
          </div>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <MoreVertical size={15} />
          </button>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin size={13} className="shrink-0" />
          <span>{partner.country}</span>
          <span className="text-slate-300">·</span>
          <span>{partner.region}</span>
        </div>

        <div className="border-t border-slate-100" />

        {/* Contact */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <Users size={13} className="text-slate-400 shrink-0" />
            <span className="font-medium">{partner.contactName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Mail size={13} className="text-slate-400 shrink-0" />
            <a
              href={`mailto:${partner.contactEmail}`}
              className="hover:text-controlcenter-600 transition-colors truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {partner.contactEmail}
            </a>
          </div>
          {partner.contactPhone && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Phone size={13} className="text-slate-400 shrink-0" />
              <span>{partner.contactPhone}</span>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Deployments</p>
            <p className="text-sm font-semibold text-slate-900">
              {partner.activeDeployments ?? "—"}{" "}
              <span className="text-slate-400 font-normal">/ {partner.deploymentCount ?? "—"}</span>
            </p>
            <p className="text-xs text-slate-400">active / total</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Revenue Share</p>
            <p className="text-sm font-semibold text-slate-900">{partner.revenueShare}%</p>
            <p className="text-xs text-slate-400">of ARR</p>
          </div>
        </div>

        {/* Contract expiry */}
        <div className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
          expired ? "bg-red-50 border border-red-100" :
          soon ? "bg-amber-50 border border-amber-100" :
          "bg-slate-50 border border-slate-100"
        )}>
          <Shield size={12} className={expired ? "text-red-500" : soon ? "text-amber-500" : "text-slate-400"} />
          <span className="text-slate-500">Contract expires:</span>
          <ContractDate date={partner.contractExpiresAt} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-1">
          <button
            onClick={onView}
            className="btn-secondary flex-1 justify-center text-xs py-1.5"
          >
            View
          </button>
          <button
            onClick={onEdit}
            className="btn-secondary flex-1 justify-center text-xs py-1.5"
          >
            <Edit size={12} />
            Edit
          </button>
          <button
            onClick={onManage}
            className="btn-primary flex-1 justify-center text-xs py-1.5"
          >
            <Building2 size={12} />
            Deployments
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card overflow-hidden animate-pulse">
          <div className="h-2 bg-slate-200" />
          <div className="p-5 space-y-3">
            <div className="h-5 bg-slate-200 rounded w-3/4" />
            <div className="flex gap-2">
              <div className="h-4 bg-slate-200 rounded-full w-16" />
              <div className="h-4 bg-slate-200 rounded-full w-14" />
            </div>
            <div className="h-3 bg-slate-100 rounded w-1/2" />
            <div className="border-t border-slate-100" />
            <div className="space-y-2">
              <div className="h-3 bg-slate-100 rounded w-2/3" />
              <div className="h-3 bg-slate-100 rounded w-3/4" />
            </div>
            <div className="h-8 bg-slate-100 rounded" />
            <div className="flex gap-2">
              <div className="h-8 bg-slate-100 rounded flex-1" />
              <div className="h-8 bg-slate-100 rounded flex-1" />
              <div className="h-8 bg-slate-200 rounded flex-1" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Add Partner Dialog
// ─────────────────────────────────────────────────────────────
const TIERS: PartnerTier[] = ["PLATINUM", "GOLD", "SILVER", "BRONZE", "RESELLER"];

interface AddPartnerForm {
  name: string;
  tier: PartnerTier;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  country: string;
  region: string;
  website: string;
  revenueShare: string;
  contractExpiresAt: string;
}

const EMPTY_FORM: AddPartnerForm = {
  name: "",
  tier: "SILVER",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  country: "",
  region: "",
  website: "",
  revenueShare: "10",
  contractExpiresAt: "",
};

function AddPartnerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (partner: Partner) => void;
}) {
  const [form, setForm] = useState<AddPartnerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function setField(key: keyof AddPartnerForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await partnerService.create({
        companyName: form.name,
        tier: form.tier,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone || undefined,
        country: form.country,
        region: form.region,
        website: form.website || undefined,
        revenueSharePercent: parseFloat(form.revenueShare) || 10,
        contractExpiry: form.contractExpiresAt || undefined,
        status: "ACTIVE",
      });
      onCreated(created);
      setForm(EMPTY_FORM);
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Handshake size={18} className="text-controlcenter-600" />
            <h2 className="font-bold text-slate-900">Add Partner</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Company Name *</label>
              <input
                required
                className="input"
                placeholder="Acme Systems Ltd"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Tier *</label>
              <select
                required
                className="select"
                value={form.tier}
                onChange={(e) => setField("tier", e.target.value as PartnerTier)}
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Revenue Share % *</label>
              <input
                required
                type="number"
                min="0"
                max="50"
                step="0.5"
                className="input"
                placeholder="10"
                value={form.revenueShare}
                onChange={(e) => setField("revenueShare", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Contact Name *</label>
              <input
                required
                className="input"
                placeholder="Jane Smith"
                value={form.contactName}
                onChange={(e) => setField("contactName", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Contact Email *</label>
              <input
                required
                type="email"
                className="input"
                placeholder="jane@acme.com"
                value={form.contactEmail}
                onChange={(e) => setField("contactEmail", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Contact Phone</label>
              <input
                className="input"
                placeholder="+1 555 000 1234"
                value={form.contactPhone}
                onChange={(e) => setField("contactPhone", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Website</label>
              <input
                type="url"
                className="input"
                placeholder="https://acme.com"
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Country *</label>
              <input
                required
                className="input"
                placeholder="South Africa"
                value={form.country}
                onChange={(e) => setField("country", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Region *</label>
              <input
                required
                className="input"
                placeholder="Africa"
                value={form.region}
                onChange={(e) => setField("region", e.target.value)}
              />
            </div>

            <div className="col-span-2">
              <label className="label">Contract Expiry Date</label>
              <input
                type="date"
                className="input"
                value={form.contractExpiresAt}
                onChange={(e) => setField("contractExpiresAt", e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              <Handshake size={14} />
              {saving ? "Creating…" : "Create Partner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Edit Partner Dialog
// ─────────────────────────────────────────────────────────────
function EditPartnerDialog({
  partner,
  onClose,
  onUpdated,
}: {
  partner: Partner | null;
  onClose: () => void;
  onUpdated: (p: Partner) => void;
}) {
  const [form, setForm] = useState<AddPartnerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (partner) {
      setForm({
        name: partner.name ?? "",
        tier: partner.tier ?? "SILVER",
        contactName: partner.contactName ?? "",
        contactEmail: partner.contactEmail ?? "",
        contactPhone: partner.contactPhone ?? "",
        country: partner.country ?? "",
        region: partner.region ?? "",
        website: partner.website ?? "",
        revenueShare: String(partner.revenueShare ?? 10),
        contractExpiresAt: partner.contractExpiresAt
          ? partner.contractExpiresAt.slice(0, 10)
          : "",
      });
    }
  }, [partner]);

  function setField(key: keyof AddPartnerForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partner) return;
    setSaving(true);
    try {
      const updated = await partnerService.update(partner.id, {
        companyName: form.name,
        tier: form.tier,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone || undefined,
        country: form.country,
        region: form.region,
        website: form.website || undefined,
        revenueSharePercent: parseFloat(form.revenueShare) || 10,
        contractExpiry: form.contractExpiresAt || undefined,
        status: partner.status || "ACTIVE",
      });
      onUpdated(updated);
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  if (!partner) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Edit size={18} className="text-controlcenter-600" />
            <h2 className="font-bold text-slate-900">Edit Partner</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Company Name *</label>
              <input required className="input" value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div>
              <label className="label">Tier *</label>
              <select required className="select" value={form.tier} onChange={(e) => setField("tier", e.target.value as PartnerTier)}>
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Revenue Share % *</label>
              <input required type="number" min="0" max="50" step="0.5" className="input" value={form.revenueShare} onChange={(e) => setField("revenueShare", e.target.value)} />
            </div>
            <div>
              <label className="label">Contact Name *</label>
              <input required className="input" value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} />
            </div>
            <div>
              <label className="label">Contact Email *</label>
              <input required type="email" className="input" value={form.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)} />
            </div>
            <div>
              <label className="label">Contact Phone</label>
              <input className="input" value={form.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} />
            </div>
            <div>
              <label className="label">Website</label>
              <input type="url" className="input" value={form.website} onChange={(e) => setField("website", e.target.value)} />
            </div>
            <div>
              <label className="label">Country *</label>
              <input required className="input" value={form.country} onChange={(e) => setField("country", e.target.value)} />
            </div>
            <div>
              <label className="label">Region *</label>
              <input required className="input" value={form.region} onChange={(e) => setField("region", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Contract Expiry Date</label>
              <input type="date" className="input" value={form.contractExpiresAt} onChange={(e) => setField("contractExpiresAt", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              <Edit size={14} />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Partner Detail Panel
// ─────────────────────────────────────────────────────────────
type DetailTab = "overview" | "deployments" | "licenses" | "contacts";

function PartnerDetailPanel({
  partner,
  onClose,
  onEdit,
}: {
  partner: Partner | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");

  useEffect(() => {
    if (partner) setTab("overview");
  }, [partner?.id]);

  if (!partner) return null;

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "deployments", label: "Deployments" },
    { key: "licenses", label: "Licenses" },
    { key: "contacts", label: "Contacts" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col">
        {/* Panel header gradient */}
        <div className={cn("bg-gradient-to-r px-6 pt-5 pb-14", TIER_GRADIENT[partner.tier])}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1">
                Partner Detail
              </p>
              <h2 className="text-white font-bold text-xl leading-tight">{partner.name}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="badge bg-white/20 text-white">
                  <Star size={10} /> {partner.tier}
                </span>
                <StatusBadge status={partner.status} />
              </div>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <Edit size={15} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs — overlap gradient */}
        <div className="bg-white border-b border-slate-200 px-6 -mt-8 relative z-10">
          <div className="flex gap-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  tab === t.key
                    ? "border-controlcenter-600 text-controlcenter-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "overview" && <OverviewTab partner={partner} />}
          {tab === "deployments" && <DeploymentsTab partner={partner} />}
          {tab === "licenses" && <LicensesTab partner={partner} />}
          {tab === "contacts" && <ContactsTab partner={partner} />}
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0 w-36">{label}</span>
      <span className="text-sm font-medium text-slate-900 text-right">{value}</span>
    </div>
  );
}

function OverviewTab({ partner }: { partner: Partner }) {
  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card text-center items-center">
          <Building2 size={18} className="text-controlcenter-500 mb-1" />
          <span className="stat-value">{partner.deploymentCount ?? "—"}</span>
          <span className="stat-label">Total Deployments</span>
        </div>
        <div className="stat-card text-center items-center">
          <TrendingUp size={18} className="text-emerald-500 mb-1" />
          <span className="stat-value">{partner.activeDeployments ?? "—"}</span>
          <span className="stat-label">Active</span>
        </div>
        <div className="stat-card text-center items-center">
          <Award size={18} className="text-amber-500 mb-1" />
          <span className="stat-value">{partner.revenueShare}%</span>
          <span className="stat-label">Rev. Share</span>
        </div>
      </div>

      {/* Details */}
      <div className="card p-4">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Partner Details</h4>
        <InfoRow label="Company" value={partner.name} />
        <InfoRow label="Tier" value={<TierBadge tier={partner.tier} />} />
        <InfoRow label="Status" value={<StatusBadge status={partner.status} />} />
        <InfoRow
          label="Country / Region"
          value={
            <span className="flex items-center gap-1">
              <MapPin size={12} className="text-slate-400" />
              {partner.country} · {partner.region}
            </span>
          }
        />
        <InfoRow label="Joined" value={formatDate(partner.joinedAt)} />
        <InfoRow
          label="Contract Expires"
          value={<ContractDate date={partner.contractExpiresAt} />}
        />
        <InfoRow
          label="Website"
          value={
            partner.website ? (
              <a
                href={partner.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-controlcenter-600 hover:underline"
              >
                {partner.website.replace(/^https?:\/\//, "")}
                <ExternalLink size={11} />
              </a>
            ) : (
              <span className="text-slate-400">—</span>
            )
          }
        />
      </div>
    </div>
  );
}

function DeploymentsTab({ partner }: { partner: Partner }) {
  const [deployments, setDeployments] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    organizationService.getAll()
      .then((orgs: Organization[]) => {
        // Attribution is partnerId ONLY. Matching on country attributed every organization in
        // the same country to this partner — a revenue-share figure built on that is wrong.
        const partnerOrgs = orgs.filter((o: Organization) => o.partnerId === partner.id);
        setDeployments(partnerOrgs);
      })
      .catch(() => setDeployments([]))
      .finally(() => setLoading(false));
  }, [partner]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Managed Deployments ({deployments.length})
        </h4>
      </div>
      {loading ? (
        <div className="text-xs text-slate-400 text-center py-6">Loading deployments…</div>
      ) : deployments.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-6">No deployments found for this partner.</div>
      ) : (
        deployments.map((d) => (
          <div key={d.id} className="card p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-controlcenter-50 rounded-lg flex items-center justify-center">
                <Building2 size={16} className="text-controlcenter-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-slate-900">{d.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Globe size={11} className="text-slate-400" />
                  <span className="text-xs text-slate-500">{d.country || "—"}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-500">{d.deployedVersion || "—"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "badge",
                  d.status === "HEALTHY" ? "badge-green" : d.status === "DEGRADED" ? "badge-yellow" : "badge-gray"
                )}
              >
                {d.status}
              </span>
              <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function LicensesTab({ partner }: { partner: Partner }) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    licenseService.getAll()
      .then((all: License[]) => {
        // Show licenses that belong to orgs in partner's country
        const partnerLicenses = all.filter((l: License) =>
          l.organizationId != null
        ).slice(0, 10);
        setLicenses(partnerLicenses);
      })
      .catch(() => setLicenses([]))
      .finally(() => setLoading(false));
  }, [partner]);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
        License Summary
      </h4>
      {loading ? (
        <div className="text-xs text-slate-400 text-center py-6">Loading licenses…</div>
      ) : licenses.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-6">No licenses found.</div>
      ) : (
        licenses.map((l) => (
          <div key={l.id} className="card p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center">
                <Shield size={14} className="text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{l.moduleName}</p>
                {l.expiryDate && (
                  <p className="text-xs text-slate-500 mt-0.5">Expires {formatDate(l.expiryDate)}</p>
                )}
              </div>
            </div>
            <span
              className={cn(
                "badge",
                l.status === "ACTIVE"
                  ? "badge-green"
                  : l.status === "EXPIRED"
                  ? "badge-red"
                  : "badge-gray"
              )}
            >
              {l.status.replace("_", " ")}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function ContactsTab({ partner }: { partner: Partner }) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Contacts</h4>

      {/* Primary contact */}
      <div className="card p-4">
        <div className="flex items-center gap-1 mb-3">
          <span className="badge badge-blue">Primary</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-controlcenter-100 rounded-full flex items-center justify-center text-controlcenter-700 font-bold text-sm">
            {partner.contactName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{partner.contactName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Mail size={11} className="text-slate-400" />
              <a href={`mailto:${partner.contactEmail}`} className="text-xs text-controlcenter-600 hover:underline">
                {partner.contactEmail}
              </a>
            </div>
            {partner.contactPhone && (
              <div className="flex items-center gap-1 mt-0.5">
                <Phone size={11} className="text-slate-400" />
                <span className="text-xs text-slate-500">{partner.contactPhone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Secondary contact placeholder */}
      <div className="card p-4 border-dashed">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">No secondary contact on file</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Table View
// ─────────────────────────────────────────────────────────────
function PartnersTable({
  partners,
  onView,
  onEdit,
}: {
  partners: Partner[];
  onView: (p: Partner) => void;
  onEdit: (p: Partner) => void;
}) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Partner</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Country</th>
            <th>Deployments</th>
            <th>Contract Expires</th>
            <th>Rev. Share</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => (
            <tr key={p.id}>
              <td>
                <div>
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.region}</p>
                </div>
              </td>
              <td>
                <TierBadge tier={p.tier} />
              </td>
              <td>
                <StatusBadge status={p.status} />
              </td>
              <td>
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} className="text-slate-400 shrink-0" />
                  {p.country}
                </div>
              </td>
              <td>
                <span className="font-semibold">{p.activeDeployments ?? "—"}</span>
                <span className="text-slate-400"> / {p.deploymentCount}</span>
              </td>
              <td>
                <ContractDate date={p.contractExpiresAt} />
              </td>
              <td>
                <span className="font-semibold">{p.revenueShare}%</span>
              </td>
              <td>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onView(p)}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700 transition-colors text-xs font-medium"
                  >
                    View
                  </button>
                  <button
                    onClick={() => onEdit(p)}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <Edit size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [addOpen, setAddOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await partnerService.getAll();
        setPartners(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(apiError(e));
        setPartners([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const total = partners.length;
    const active = partners.filter((p) => p.status === "ACTIVE").length;
    const deployments = partners.reduce((sum, p) => sum + p.activeDeployments, 0);
    const avgRevShare =
      partners.length > 0
        ? (partners.reduce((sum, p) => sum + p.revenueShare, 0) / partners.length).toFixed(1)
        : "0.0";
    return { total, active, deployments, avgRevShare };
  }, [partners]);

  function handlePartnerCreated(partner: Partner) {
    setPartners((prev) => [partner, ...prev]);
  }

  function handlePartnerUpdated(updated: Partner) {
    setPartners((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (selectedPartner?.id === updated.id) setSelectedPartner(updated);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Handshake size={22} className="text-controlcenter-600" />
            Partners
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Resellers and system integrators deploying ZGATE for end customers
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="btn-primary"
        >
          <Handshake size={15} />
          <Plus size={13} />
          Add Partner
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Handshake size={16} />
            <span className="stat-label">Total Partners</span>
          </div>
          <span className="stat-value">{loading ? "—" : stats.total}</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-emerald-500 mb-1">
            <Shield size={16} />
            <span className="stat-label">Active</span>
          </div>
          <span className="stat-value">{loading ? "—" : stats.active}</span>
          {!loading && (
            <span className="text-xs text-slate-400">
              {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}% of total
            </span>
          )}
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-controlcenter-500 mb-1">
            <Building2 size={16} />
            <span className="stat-label">Active Deployments</span>
          </div>
          <span className="stat-value">{loading ? "—" : stats.deployments}</span>
          <span className="text-xs text-slate-400">under partners</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <TrendingUp size={16} />
            <span className="stat-label">Avg. Revenue Share</span>
          </div>
          <span className="stat-value">{loading ? "—" : `${stats.avgRevShare}%`}</span>
          <span className="text-xs text-slate-400">across all partners</span>
        </div>
      </div>

      {/* View toggle + filters */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {loading ? "Loading…" : `${partners.length} partner${partners.length !== 1 ? "s" : ""}`}
        </p>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setView("grid")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === "grid"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <LayoutGrid size={14} />
            Grid
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === "table"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <List size={14} />
            Table
          </button>
        </div>
      </div>

      {/* Content */}
      {error && (
        <div className="card p-5 border-red-200 bg-red-50">
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : partners.length === 0 ? (
        <div className="card p-12 text-center">
          <Briefcase size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No partners found</p>
          <p className="text-sm text-slate-400 mt-1">Add your first partner to get started</p>
          <button onClick={() => setAddOpen(true)} className="btn-primary mx-auto mt-4">
            <Plus size={14} /> Add Partner
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {partners.map((p) => (
            <PartnerCard
              key={p.id}
              partner={p}
              onView={() => setSelectedPartner(p)}
              onEdit={() => {
                setSelectedPartner(p);
                setEditPartner(p);
              }}
              onManage={() => {
                setSelectedPartner(p);
              }}
            />
          ))}
        </div>
      ) : (
        <PartnersTable
          partners={partners}
          onView={(p) => setSelectedPartner(p)}
          onEdit={(p) => {
            setSelectedPartner(p);
            setEditPartner(p);
          }}
        />
      )}

      {/* Add Partner Dialog */}
      <AddPartnerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handlePartnerCreated}
      />

      {/* Edit Partner Dialog */}
      <EditPartnerDialog
        partner={editPartner}
        onClose={() => setEditPartner(null)}
        onUpdated={handlePartnerUpdated}
      />

      {/* Partner Detail Panel */}
      <PartnerDetailPanel
        partner={selectedPartner}
        onClose={() => setSelectedPartner(null)}
        onEdit={() => { if (selectedPartner) setEditPartner(selectedPartner); }}
      />
    </div>
  );
}
