/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Globe,
  Shield,
  Zap,
  CreditCard,
  MessageSquare,
  Activity,
  Eye,
  Settings,
  Plus,
  Search,
  X,
  Check,
  ToggleLeft,
  ToggleRight,
  Users,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Filter,
} from "lucide-react";
import { sharedServicesCatalog } from "@/services/controlcenter.service";
import { getCurrentUserEmail } from "@/lib/utils";
import type {
  SharedService,
  OrgServiceSubscription,
  ServiceCategory,
  ServiceStatus,
  ServiceRegion,
  PricingModel,
} from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES: ServiceCategory[] = [
  "IDENTITY_VERIFICATION",
  "SANCTION_SCREENING",
  "KYC_AML",
  "CREDIT_BUREAU",
  "COMMUNICATION",
  "FRAUD_DETECTION",
];

const ALL_STATUSES: ServiceStatus[] = ["ACTIVE", "INACTIVE", "BETA", "DEPRECATED", "MAINTENANCE"];

const ALL_REGIONS: ServiceRegion[] = [
  "GLOBAL", "AFRICA", "NIGERIA", "SOUTH_AFRICA", "KENYA", "GHANA", "MENA", "EU",
];

const ALL_PRICING_MODELS: PricingModel[] = [
  "PER_CALL", "TIERED", "MONTHLY_FLAT", "VOLUME_DISCOUNT",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(3)}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function categoryLabel(c: ServiceCategory): string {
  const map: Record<ServiceCategory, string> = {
    IDENTITY_VERIFICATION: "Identity",
    SANCTION_SCREENING: "Sanctions",
    KYC_AML: "KYC / AML",
    CREDIT_BUREAU: "Credit",
    COMMUNICATION: "Comms",
    FRAUD_DETECTION: "Fraud",
  };
  return map[c] ?? c;
}

function categoryColors(c: ServiceCategory): { badge: string; icon: string } {
  const map: Record<ServiceCategory, { badge: string; icon: string }> = {
    IDENTITY_VERIFICATION: { badge: "bg-blue-100 text-blue-700", icon: "text-blue-600" },
    SANCTION_SCREENING: { badge: "bg-red-100 text-red-700", icon: "text-red-600" },
    KYC_AML: { badge: "bg-orange-100 text-orange-700", icon: "text-orange-600" },
    CREDIT_BUREAU: { badge: "bg-purple-100 text-purple-700", icon: "text-purple-600" },
    COMMUNICATION: { badge: "bg-green-100 text-green-700", icon: "text-green-600" },
    FRAUD_DETECTION: { badge: "bg-yellow-100 text-yellow-700", icon: "text-yellow-600" },
  };
  return map[c] ?? { badge: "bg-slate-100 text-slate-600", icon: "text-slate-500" };
}

function CategoryIcon({ category, className }: { category: ServiceCategory; className?: string }) {
  const cls = className ?? "w-4 h-4";
  switch (category) {
    case "IDENTITY_VERIFICATION": return <Shield className={cls} />;
    case "SANCTION_SCREENING": return <Globe className={cls} />;
    case "KYC_AML": return <Activity className={cls} />;
    case "CREDIT_BUREAU": return <CreditCard className={cls} />;
    case "COMMUNICATION": return <MessageSquare className={cls} />;
    case "FRAUD_DETECTION": return <Zap className={cls} />;
    default: return <Activity className={cls} />;
  }
}

function statusBadge(status: ServiceStatus): string {
  const map: Record<ServiceStatus, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    INACTIVE: "bg-slate-100 text-slate-500",
    BETA: "bg-yellow-100 text-yellow-700",
    DEPRECATED: "bg-red-100 text-red-600",
    MAINTENANCE: "bg-orange-100 text-orange-700",
  };
  return map[status] ?? "bg-slate-100 text-slate-500";
}

function pricingLabel(m: PricingModel): string {
  const map: Record<PricingModel, string> = {
    PER_CALL: "Per Call",
    TIERED: "Tiered",
    MONTHLY_FLAT: "Monthly Flat",
    VOLUME_DISCOUNT: "Volume Discount",
  };
  return map[m];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

function RegionTag({ region }: { region: ServiceRegion }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
      {region}
    </span>
  );
}

// ─── Service Detail Panel ─────────────────────────────────────────────────────

function ServiceDetailPanel({
  service,
  onClose,
  onManageSubs,
}: {
  service: SharedService;
  onClose: () => void;
  onManageSubs: (service: SharedService) => void;
}) {
  const colors = categoryColors(service.category);

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="w-[520px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between z-10">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.badge}`}>
              <CategoryIcon category={service.category} className={`w-5 h-5 ${colors.icon}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{service.name}</h2>
              <code className="text-xs text-slate-500 font-mono">{service.code}</code>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Status + Category */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge(service.status)}`}>
              {service.status}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors.badge}`}>
              {categoryLabel(service.category)}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              {pricingLabel(service.pricingModel)}
            </span>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1.5">About</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {service.longDescription || service.description}
            </p>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-0.5">Provider</p>
              <p className="text-sm font-medium text-slate-800">{service.provider}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-0.5">Base Price</p>
              <p className="text-sm font-bold text-slate-800">{formatPrice(service.basePricePerCall)} / call</p>
            </div>
            {service.slaMs && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-0.5">SLA Response</p>
                <p className="text-sm font-medium text-slate-800">&lt; {service.slaMs.toLocaleString()} ms</p>
              </div>
            )}
            {service.uptime99 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-0.5">Uptime SLA</p>
                <p className="text-sm font-medium text-slate-800">{service.uptime99}%</p>
              </div>
            )}
          </div>

          {/* Regions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Available Regions</h3>
            <div className="flex flex-wrap gap-1.5">
              {service.regions.map((r) => (
                <RegionTag key={r} region={r} />
              ))}
            </div>
          </div>

          {/* Pricing Tiers */}
          {service.tiers && service.tiers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Pricing Tiers</h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">Volume</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">Price / Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {service.tiers.map((tier, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{tier.label}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-900 font-medium">
                          {formatPrice(tier.pricePerCall)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sample Request */}
          {service.sampleRequest && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Sample Request</h3>
              <pre className="bg-slate-900 text-green-400 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed font-mono">
                {service.sampleRequest}
              </pre>
            </div>
          )}

          {/* Sample Response */}
          {service.sampleResponse && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Sample Response</h3>
              <pre className="bg-slate-900 text-blue-300 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed font-mono">
                {service.sampleResponse}
              </pre>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600 mb-0.5">All-time Calls</p>
              <p className="text-lg font-bold text-blue-800">{formatNumber(service.totalCallsAllTime)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600 mb-0.5">Active Subscribers</p>
              <p className="text-lg font-bold text-blue-800">{service.activeSubscribers}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3">
          {service.docsUrl && (
            <a
              href={service.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Eye className="w-4 h-4" /> View Docs
            </a>
          )}
          <button
            onClick={() => onManageSubs(service)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Settings className="w-4 h-4" /> Manage Subscriptions
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Service Modal ────────────────────────────────────────────────────────

function AddServiceModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: Partial<SharedService>) => Promise<void>;
}) {
  const [form, setForm] = useState<{
    name: string;
    code: string;
    category: ServiceCategory;
    description: string;
    provider: string;
    pricingModel: PricingModel;
    basePricePerCall: string;
    status: ServiceStatus;
    regions: ServiceRegion[];
    currency: "USD" | "NGN" | "ZAR" | "KES" | "GHS";
  }>({
    name: "",
    code: "",
    category: "IDENTITY_VERIFICATION",
    description: "",
    provider: "",
    pricingModel: "PER_CALL",
    basePricePerCall: "",
    status: "ACTIVE",
    regions: [],
    currency: "USD",
  });
  const [loading, setLoading] = useState(false);

  function toggleRegion(r: ServiceRegion) {
    setForm((f) => ({
      ...f,
      regions: f.regions.includes(r) ? f.regions.filter((x) => x !== r) : [...f.regions, r],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.code || !form.description || !form.provider || !form.basePricePerCall) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (form.regions.length === 0) {
      toast.error("Select at least one region.");
      return;
    }
    setLoading(true);
    try {
      // The service layer maps this to the backend shape (category enum + pricePerCall field).
      await onSubmit({
        ...form,
        code: form.code.toUpperCase().replace(/\s+/g, "_"),
        basePricePerCall: parseFloat(form.basePricePerCall) * 100,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[500px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-slate-900">Add Shared Service</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Service Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. NIN Lookup"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Code */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Service Code *</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="e.g. NIN_LOOKUP"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">Will be uppercased automatically</p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category *</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ServiceCategory }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Brief description of what this service does..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Provider *</label>
            <input
              type="text"
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              placeholder="e.g. NIMC / Smile Identity"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Pricing model + price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pricing Model *</label>
              <select
                value={form.pricingModel}
                onChange={(e) => setForm((f) => ({ ...f, pricingModel: e.target.value as PricingModel }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ALL_PRICING_MODELS.map((m) => (
                  <option key={m} value={m}>{pricingLabel(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Base Price (USD) *</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.basePricePerCall}
                onChange={(e) => setForm((f) => ({ ...f, basePricePerCall: e.target.value }))}
                placeholder="0.015"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Status *</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ServiceStatus }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Currency *</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as typeof form.currency }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(["USD", "NGN", "ZAR", "KES", "GHS"] as const).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Regions */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Regions *</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_REGIONS.map((r) => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => toggleRegion(r)}
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                      form.regions.includes(r)
                        ? "bg-blue-600 border-blue-600"
                        : "border-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {form.regions.includes(r) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span
                    onClick={() => toggleRegion(r)}
                    className="text-sm text-slate-700 cursor-pointer"
                  >
                    {r}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </form>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add Service
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Enable For Org Modal ─────────────────────────────────────────────────────

function EnableForOrgModal({
  services,
  onClose,
  onSubmit,
}: {
  services: SharedService[];
  onClose: () => void;
  onSubmit: (orgId: string, orgName: string, serviceId: string, callLimit: number) => Promise<void>;
}) {
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [callLimit, setCallLimit] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !orgName || !serviceId) {
      toast.error("Please fill all required fields.");
      return;
    }
    setLoading(true);
    try {
      await onSubmit(orgId, orgName, serviceId, parseInt(callLimit) || 0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl z-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Enable Service for Organization</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Org ID *</label>
              <input
                type="text"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="org-001"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Org Name *</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Apex Capital"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Service *</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a service...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Monthly Call Limit <span className="text-slate-400">(0 = unlimited)</span>
            </label>
            <input
              type="number"
              min="0"
              value={callLimit}
              onChange={(e) => setCallLimit(e.target.value)}
              placeholder="10000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Enable Service
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SharedServicesPage() {
  const [services, setServices] = useState<SharedService[]>([]);
  const [subscriptions, setSubscriptions] = useState<OrgServiceSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"services" | "subscriptions" | "usage">("services");

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | "ALL">("ALL");

  // Panels / modals
  const [selectedService, setSelectedService] = useState<SharedService | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEnableModal, setShowEnableModal] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await sharedServicesCatalog.getAll();
        setServices(Array.isArray(data) ? data : []);
      } catch {
        setServices([]);
      }
      try {
        const subs = await sharedServicesCatalog.getAllSubscriptions();
        setSubscriptions(Array.isArray(subs) ? subs : []);
      } catch {
        setSubscriptions([]);
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalServices = services.length;
    const activeServices = services.filter((s) => s.status === "ACTIVE").length;
    const activeSubscriptions = subscriptions.filter((s) => s.enabled).length;
    const totalCallsThisMonth = subscriptions.reduce((sum, s) => sum + s.currentMonthCalls, 0);
    return { totalServices, activeServices, activeSubscriptions, totalCallsThisMonth };
  }, [services, subscriptions]);

  // ── Filtered services ──────────────────────────────────────────────────────

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase()) ||
        s.provider.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "ALL" || s.category === categoryFilter;
      const matchStatus = statusFilter === "ALL" || s.status === statusFilter;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [services, search, categoryFilter, statusFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleAddService(data: Partial<SharedService>) {
    try {
      const created = await sharedServicesCatalog.create(data);
      setServices((prev) => [created, ...prev]);
      setShowAddModal(false);
      toast.success(`${data.name} added to the marketplace.`);
    } catch {
      toast.error("Failed to create service.");
    }
  }

  async function handleToggleSubscription(sub: OrgServiceSubscription) {
    const action = sub.enabled ? "disable" : "enable";
    try {
      if (sub.enabled) {
        await sharedServicesCatalog.disableForOrg(sub.organizationId, sub.serviceId);
      } else {
        await sharedServicesCatalog.enableForOrg(sub.organizationId, sub.serviceId);
      }
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, enabled: !s.enabled } : s))
      );
      toast.success(`${sub.serviceName} ${action}d for ${sub.organizationName}.`);
    } catch {
      toast.error(`Failed to ${action} ${sub.serviceName}.`);
    }
  }

  async function handleEnableForOrg(orgId: string, orgName: string, serviceId: string, callLimit: number) {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;

    // Check if already exists
    const existing = subscriptions.find(
      (s) => s.organizationId === orgId && s.serviceId === serviceId
    );
    if (existing) {
      toast.error(`${orgName} already has a subscription for ${service.name}.`);
      return;
    }

    try {
      const newSub = await sharedServicesCatalog.enableForOrg(orgId, serviceId, callLimit, getCurrentUserEmail());
      setSubscriptions((prev) => [newSub, ...prev]);
      setShowEnableModal(false);
      toast.success(`${service.name} enabled for ${orgName}.`);
    } catch {
      toast.error(`Failed to enable ${service.name} for ${orgName}.`);
    }
  }

  // ── Derive usage data from subscriptions ────────────────────────────────────

  const usageData = useMemo(() => {
    return subscriptions.map((s) => ({
      serviceCode: s.serviceCode,
      serviceName: s.serviceName,
      orgName: s.organizationName,
      callsThisMonth: s.currentMonthCalls,
      successRate: s.currentMonthCalls > 0 ? 99.0 : 0,
      limitPerMonth: s.monthlyCallLimit,
      costUsd: 0,
    }));
  }, [subscriptions]);

  const topServicesByVolume = useMemo(() => {
    const grouped: Record<string, { name: string; calls: number }> = {};
    usageData.forEach((u) => {
      if (!grouped[u.serviceCode]) grouped[u.serviceCode] = { name: u.serviceName, calls: 0 };
      grouped[u.serviceCode].calls += u.callsThisMonth;
    });
    return Object.entries(grouped)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 3);
  }, [usageData]);

  const maxUsageCallsForScale = useMemo(() => {
    return Math.max(...usageData.map((u) => u.limitPerMonth ?? 0), 1);
  }, [usageData]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading API Marketplace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">API Marketplace</h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage centralized shared services available to ZGATE enterprise deployments
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </button>
        </div>

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Services"
            value={stats.totalServices}
            icon={Activity}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="Active Services"
            value={stats.activeServices}
            icon={Check}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            label="Active Subscriptions"
            value={stats.activeSubscriptions}
            icon={Users}
            color="bg-purple-50 text-purple-600"
          />
          <StatCard
            label="API Calls This Month"
            value={formatNumber(stats.totalCallsThisMonth)}
            icon={TrendingUp}
            color="bg-orange-50 text-orange-600"
          />
        </div>

        {/* ── Tabs ── */}
        <div className="border-b border-slate-200">
          <nav className="flex gap-1">
            {(["services", "subscriptions", "usage"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "services"
                  ? `Services (${services.length})`
                  : tab === "subscriptions"
                  ? `Subscriptions (${subscriptions.length})`
                  : "Usage"}
              </button>
            ))}
          </nav>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SERVICES TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "services" && (
          <div className="space-y-5">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search services..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as ServiceCategory | "ALL")}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-700"
                >
                  <option value="ALL">All Categories</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ServiceStatus | "ALL")}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-700"
                >
                  <option value="ALL">All Statuses</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results count */}
            {(search || categoryFilter !== "ALL" || statusFilter !== "ALL") && (
              <p className="text-sm text-slate-500">
                Showing {filteredServices.length} of {services.length} services
              </p>
            )}

            {/* Service cards grid */}
            {filteredServices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertCircle className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No services found</p>
                <p className="text-slate-400 text-sm mt-1">Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredServices.map((service) => {
                  const colors = categoryColors(service.category);
                  return (
                    <div
                      key={service.id}
                      onClick={() => setSelectedService(service)}
                      className="group bg-white rounded-xl shadow-sm border border-slate-100 p-5 cursor-pointer hover:shadow-md transition-all duration-200 relative overflow-hidden"
                    >
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-blue-600/[0.03] opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />

                      {/* Top row: category icon + status badge */}
                      <div className="flex items-center justify-between mb-3">
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${colors.badge}`}>
                          <CategoryIcon category={service.category} className={`w-3.5 h-3.5 ${colors.icon}`} />
                          <span className="text-xs font-semibold">{categoryLabel(service.category)}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(service.status)}`}>
                          {service.status}
                        </span>
                      </div>

                      {/* Service name + code */}
                      <div className="mb-2">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                          {service.name}
                        </h3>
                        <code className="text-xs text-slate-400 font-mono">{service.code}</code>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">
                        {service.description}
                      </p>

                      {/* Provider */}
                      <p className="text-xs text-slate-400 mb-3">
                        <span className="font-medium text-slate-600">Provider:</span> {service.provider}
                      </p>

                      {/* Price */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-base font-bold text-slate-900">
                            {formatPrice(service.basePricePerCall)}
                          </span>
                          <span className="text-xs text-slate-400"> / call</span>
                        </div>
                        <span className="text-xs text-slate-400">{pricingLabel(service.pricingModel)}</span>
                      </div>

                      {/* Regions */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {service.regions.slice(0, 3).map((r) => (
                          <RegionTag key={r} region={r} />
                        ))}
                        {service.regions.length > 3 && (
                          <span className="text-xs text-slate-400 px-1">+{service.regions.length - 3}</span>
                        )}
                      </div>

                      {/* Footer stats */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Users className="w-3.5 h-3.5" />
                          <span>{service.activeSubscribers} subscribers</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>{formatNumber(service.totalCallsAllTime)} calls</span>
                        </div>
                      </div>

                      {/* Hover actions */}
                      <div className="absolute inset-x-0 bottom-0 bg-white border-t border-slate-100 px-4 py-2.5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-y-full group-hover:translate-y-0 duration-200">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedService(service); }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Details
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab("subscriptions");
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          <Settings className="w-3.5 h-3.5" /> Manage Subs
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SUBSCRIPTIONS TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "subscriptions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Organization Subscriptions ({subscriptions.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Which organizations have which services enabled
                </p>
              </div>
              <button
                onClick={() => setShowEnableModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Enable for Org
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Organization</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Service</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Monthly Limit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Used This Month</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Enabled By</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub) => {
                      const pct = sub.monthlyCallLimit
                        ? Math.min(100, Math.round((sub.currentMonthCalls / sub.monthlyCallLimit) * 100))
                        : 0;
                      const isNearLimit = pct >= 80;

                      return (
                        <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-slate-900 text-sm">{sub.organizationName}</p>
                            <p className="text-xs text-slate-400 font-mono">{sub.organizationId}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-slate-800">{sub.serviceName}</p>
                            <code className="text-xs text-slate-400">{sub.serviceCode}</code>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                sub.enabled
                                  ? "bg-green-100 text-green-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {sub.enabled ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                              {sub.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700">
                            {sub.monthlyCallLimit
                              ? sub.monthlyCallLimit.toLocaleString()
                              : <span className="text-slate-400">Unlimited</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className={isNearLimit ? "text-orange-600 font-medium" : "text-slate-600"}>
                                  {sub.currentMonthCalls.toLocaleString()}
                                </span>
                                {sub.monthlyCallLimit ? (
                                  <span className={`font-medium ${isNearLimit ? "text-orange-600" : "text-slate-400"}`}>
                                    {pct}%
                                  </span>
                                ) : null}
                              </div>
                              {sub.monthlyCallLimit ? (
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      pct >= 90
                                        ? "bg-red-500"
                                        : pct >= 80
                                        ? "bg-orange-400"
                                        : "bg-blue-500"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500">
                            {sub.enabledBy || "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => handleToggleSubscription(sub)}
                              title={sub.enabled ? "Disable" : "Enable"}
                              className={`p-1.5 rounded-lg transition-colors ${
                                sub.enabled
                                  ? "text-green-600 hover:bg-green-50"
                                  : "text-slate-400 hover:bg-slate-100"
                              }`}
                            >
                              {sub.enabled ? (
                                <ToggleRight className="w-5 h-5" />
                              ) : (
                                <ToggleLeft className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {subscriptions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertCircle className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-slate-500 text-sm font-medium">No subscriptions yet</p>
                  <p className="text-slate-400 text-xs mt-1">Enable services for organizations to see them here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            USAGE TAB
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "usage" && (
          <div className="space-y-5">
            {/* Top services by volume */}
            <div>
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                Top Services by Call Volume This Month
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {topServicesByVolume.map((svc, i) => {
                  const maxCalls = topServicesByVolume[0]?.calls || 1;
                  const pct = Math.round((svc.calls / maxCalls) * 100);
                  const medals = ["text-yellow-500", "text-slate-400", "text-orange-400"];

                  return (
                    <div key={svc.code} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-xs text-slate-500 font-medium">{`#${i + 1}`}</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">{svc.name}</p>
                          <code className="text-xs text-slate-400">{svc.code}</code>
                        </div>
                        <TrendingUp className={`w-5 h-5 ${medals[i]}`} />
                      </div>
                      <p className="text-2xl font-bold text-slate-900 mb-2">{formatNumber(svc.calls)}</p>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{pct}% of top service volume</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Usage table */}
            <div>
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Detailed Usage — March 2026</h2>
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Service</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Organization</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Calls This Month</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Success Rate</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">vs Limit</th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageData.map((row, i) => {
                        const pct = row.limitPerMonth
                          ? Math.min(100, Math.round((row.callsThisMonth / row.limitPerMonth) * 100))
                          : 0;

                        return (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 py-3.5">
                              <p className="font-medium text-slate-900">{row.serviceName}</p>
                              <code className="text-xs text-slate-400">{row.serviceCode}</code>
                            </td>
                            <td className="px-5 py-3.5 text-slate-700">{row.orgName}</td>
                            <td className="px-4 py-3.5">
                              <span className="font-semibold text-slate-900">
                                {row.callsThisMonth.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              {row.callsThisMonth === 0 ? (
                                <span className="text-slate-400 text-xs">—</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        row.successRate >= 99
                                          ? "bg-green-500"
                                          : row.successRate >= 95
                                          ? "bg-blue-500"
                                          : "bg-orange-400"
                                      }`}
                                      style={{ width: `${row.successRate}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-xs font-medium ${
                                      row.successRate >= 99
                                        ? "text-green-600"
                                        : row.successRate >= 95
                                        ? "text-blue-600"
                                        : "text-orange-600"
                                    }`}
                                  >
                                    {row.successRate}%
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="space-y-1">
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden" style={{ maxWidth: "120px" }}>
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      pct >= 90
                                        ? "bg-red-500"
                                        : pct >= 80
                                        ? "bg-orange-400"
                                        : "bg-slate-400"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-xs text-slate-400">
                                  {pct}% of {(row.limitPerMonth ?? 0).toLocaleString()}
                                </p>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <span className="font-semibold text-slate-900">
                                ${row.costUsd.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                          Total Estimated Cost
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-slate-900">
                          ${usageData.reduce((sum, r) => sum + r.costUsd, 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Service Detail Panel ── */}
      {selectedService && (
        <ServiceDetailPanel
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onManageSubs={(svc) => {
            setSelectedService(null);
            setActiveTab("subscriptions");
          }}
        />
      )}

      {/* ── Add Service Modal ── */}
      {showAddModal && (
        <AddServiceModal
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddService}
        />
      )}

      {/* ── Enable For Org Modal ── */}
      {showEnableModal && (
        <EnableForOrgModal
          services={services.filter((s) => s.status === "ACTIVE" || s.status === "BETA")}
          onClose={() => setShowEnableModal(false)}
          onSubmit={handleEnableForOrg}
        />
      )}
    </div>
  );
}
