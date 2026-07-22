/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  FileText,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Clock,
  Send,
  CreditCard,
  TrendingUp,
  Download,
  Eye,
  Filter,
  Search,
  Plus,
  X,
  Receipt,
  Building,
  ChevronDown,
  Calendar,
  Banknote,
} from "lucide-react";
import { billingService, organizationService } from "@/services/controlcenter.service";
import type { Invoice, InvoiceLineItem, BillingAccount, Organization } from "@/types";



// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "invoices" | "accounts" | "revenue";
type InvoiceStatus = Invoice["status"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sm = s.toLocaleDateString("en-US", { month: "short" });
  const em = e.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return sm === em ? em : `${sm}–${em}`;
}

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT:    { label: "Draft",    className: "bg-slate-100 text-slate-600 border border-slate-200" },
  SENT:     { label: "Sent",     className: "bg-blue-50 text-blue-700 border border-blue-200" },
  PAID:     { label: "Paid",     className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  OVERDUE:  { label: "Overdue",  className: "bg-red-50 text-red-700 border border-red-200" },
  VOID:     { label: "Void",     className: "bg-slate-50 text-slate-400 border border-slate-200" },
  DISPUTED: { label: "Disputed", className: "bg-orange-50 text-orange-700 border border-orange-200" },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.className}`}>
      {status === "PAID" && <CheckCircle size={10} />}
      {status === "OVERDUE" && <AlertCircle size={10} />}
      {status === "SENT" && <Send size={10} />}
      {status === "DRAFT" && <FileText size={10} />}
      {cfg.label}
    </span>
  );
}

// ─── Invoice Detail Slide-over ─────────────────────────────────────────────────

function InvoiceDetailModal({
  invoice,
  onClose,
  onSend,
  onMarkPaid,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSend: (id: string) => Promise<void>;
  onMarkPaid: (id: string) => Promise<void>;
}) {
  const [acting, setActing] = useState<string | null>(null);

  async function handleSend() {
    setActing("send");
    await onSend(invoice.id);
    setActing(null);
  }

  async function handleMarkPaid() {
    setActing("pay");
    await onMarkPaid(invoice.id);
    setActing(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Receipt size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">{invoice.invoiceNumber}</h2>
              <p className="text-xs text-slate-500">{invoice.organizationName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={invoice.status} />
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Organization", value: invoice.organizationName },
              { label: "Email", value: invoice.organizationEmail },
              { label: "Billing Period", value: fmtPeriod(invoice.periodStart, invoice.periodEnd) },
              { label: "Issued", value: fmtDate(invoice.issuedAt) },
              { label: "Due Date", value: fmtDate(invoice.dueAt) },
              ...(invoice.paidAt ? [{ label: "Paid On", value: fmtDate(invoice.paidAt) }] : []),
              ...(invoice.paymentMethod ? [{ label: "Payment Method", value: invoice.paymentMethod.replace(/_/g, " ") }] : []),
              ...(invoice.paymentReference ? [{ label: "Reference", value: invoice.paymentReference }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
                <div className="text-sm text-slate-800 mt-0.5 font-medium">{value}</div>
              </div>
            ))}
          </div>

          {/* Dispute notice */}
          {invoice.disputeReason && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
              <div className="flex items-center gap-2 text-orange-700 text-xs font-semibold mb-1">
                <AlertCircle size={13} />
                Dispute Reason
              </div>
              <p className="text-xs text-orange-700">{invoice.disputeReason}</p>
            </div>
          )}

          {/* Line items */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Line Items</h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Service</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Calls</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Unit Price</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lineItems.map((item) => (
                    <tr key={item.serviceId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 text-xs">{item.serviceName}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.serviceCode}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 font-mono">
                        {item.callCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600">
                        ${(item.unitPriceCents / 100).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-800">
                        {fmt(item.subtotalUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium">{fmt(invoice.subtotalUsd)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Tax ({invoice.taxPercent}%)</span>
              <span className="font-medium">{fmt(invoice.taxAmountUsd)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold text-slate-900">
              <span>Total</span>
              <span className="text-blue-700">{fmt(invoice.totalUsd)}</span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={async () => {
              try {
                const blob = await billingService.downloadPdf(invoice.id);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { toast.error("Failed to download PDF"); }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Download PDF
          </button>
          <div className="flex items-center gap-2">
            {(invoice.status === "DRAFT") && (
              <button
                onClick={handleSend}
                disabled={acting === "send"}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                <Send size={14} />
                {acting === "send" ? "Sending…" : "Send Invoice"}
              </button>
            )}
            {(invoice.status === "SENT") && (
              <button
                onClick={handleSend}
                disabled={acting === "send"}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60 transition-colors"
              >
                <Send size={14} />
                {acting === "send" ? "Sending…" : "Resend"}
              </button>
            )}
            {(invoice.status === "DRAFT" || invoice.status === "SENT" || invoice.status === "OVERDUE" || invoice.status === "DISPUTED") && (
              <button
                onClick={handleMarkPaid}
                disabled={acting === "pay"}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-60
                  ${invoice.status === "OVERDUE"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
              >
                <CheckCircle size={14} />
                {acting === "pay" ? "Marking…" : "Mark Paid"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Generate Invoice Modal ────────────────────────────────────────────────────


function GenerateInvoiceModal({
  organizations,
  onClose,
  onGenerated,
}: {
  organizations: Organization[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [orgId, setOrgId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !periodStart || !periodEnd) {
      toast.error("Please fill in all fields");
      return;
    }
    if (new Date(periodEnd) < new Date(periodStart)) {
      toast.error("Period end must be after period start");
      return;
    }
    setLoading(true);
    try {
      await billingService.generate(orgId, periodStart, periodEnd);
      toast.success("Invoice generated successfully");
      onGenerated();
      onClose();
    } catch {
      toast.error("Failed to generate invoice. Check billing period and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Plus size={16} className="text-blue-600" />
            </div>
            <h2 className="text-sm font-bold text-slate-800">Generate Invoice</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Organization</label>
            <div className="relative">
              <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                required
              >
                <option value="">Select organization…</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Period Start</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Period End</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              <FileText size={14} />
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
  colorClass,
  iconBg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  colorClass: string;
  iconBg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Revenue Tab ─────────────────────────────────────────────────────────────

function RevenueTab({ invoices }: { invoices: Invoice[] }) {
  const thisMonth = new Date();
  const thisMonthStr = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const paidInvoices = invoices.filter((i) => i.status === "PAID");

  const totalRevenue = paidInvoices.reduce((s, i) => s + i.totalUsd, 0);
  const thisMonthRevenue = paidInvoices
    .filter((i) => i.paidAt && i.paidAt.startsWith(thisMonthStr))
    .reduce((s, i) => s + i.totalUsd, 0);
  const lastMonthRevenue = paidInvoices
    .filter((i) => i.paidAt && i.paidAt.startsWith(lastMonthStr))
    .reduce((s, i) => s + i.totalUsd, 0);

  const momGrowth = lastMonthRevenue > 0
    ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
    : "N/A";

  // Revenue by service (across all invoices, not just paid for display purposes)
  const serviceRevMap: Record<string, { name: string; calls: number; revenue: number }> = {};
  for (const inv of invoices) {
    for (const item of inv.lineItems) {
      if (!serviceRevMap[item.serviceCode]) {
        serviceRevMap[item.serviceCode] = { name: item.serviceName, calls: 0, revenue: 0 };
      }
      serviceRevMap[item.serviceCode].calls += item.callCount;
      serviceRevMap[item.serviceCode].revenue += item.subtotalUsd;
    }
  }
  const serviceRows = Object.entries(serviceRevMap)
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
  const totalServiceRevenue = serviceRows.reduce((s, r) => s + r.revenue, 0);
  const maxServiceRevenue = serviceRows[0]?.revenue ?? 1;

  // Top orgs
  const orgSpendMap: Record<string, { name: string; calls: number; spend: number; lastInvoice?: string }> = {};
  for (const inv of invoices) {
    if (!orgSpendMap[inv.organizationId]) {
      orgSpendMap[inv.organizationId] = { name: inv.organizationName, calls: 0, spend: 0 };
    }
    orgSpendMap[inv.organizationId].calls += inv.lineItems.reduce((s, i) => s + i.callCount, 0);
    if (inv.status === "PAID") orgSpendMap[inv.organizationId].spend += inv.totalUsd;
    orgSpendMap[inv.organizationId].lastInvoice = inv.invoiceNumber;
  }
  const topOrgs = Object.values(orgSpendMap).sort((a, b) => b.spend - a.spend);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-medium text-slate-500">Total Revenue (All Time)</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(totalRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">{paidInvoices.length} paid invoices</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-medium text-slate-500">Revenue This Month</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(thisMonthRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">March 2026</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-slate-500">MoM Growth</p>
            <TrendingUp size={12} className="text-emerald-500" />
          </div>
          <p className={`text-2xl font-bold mt-1 ${momGrowth === "N/A" ? "text-slate-400" : parseFloat(momGrowth) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {momGrowth === "N/A" ? "N/A" : `${momGrowth}%`}
          </p>
          <p className="text-xs text-slate-400 mt-1">vs. February 2026</p>
        </div>
      </div>

      {/* Revenue by service */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Banknote size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Revenue by Service</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Service</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">Total Calls</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">Revenue</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serviceRows.map((row) => {
                const pct = totalServiceRevenue > 0 ? (row.revenue / totalServiceRevenue) * 100 : 0;
                const barPct = maxServiceRevenue > 0 ? (row.revenue / maxServiceRevenue) * 100 : 0;
                return (
                  <tr key={row.code} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800 text-xs">{row.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{row.code}</div>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-600 font-mono">
                      {row.calls.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-semibold text-slate-800">
                      {fmt(row.revenue)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[80px]">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 w-9 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top organizations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Building size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Top Paying Organizations</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Organization</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">Total Calls</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">Total Spend</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Last Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topOrgs.map((org) => (
                <tr key={org.name} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <Building size={11} className="text-blue-600" />
                      </div>
                      <span className="font-medium text-slate-800 text-xs">{org.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-slate-600 font-mono">
                    {org.calls.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right text-xs font-bold text-slate-800">
                    {fmt(org.spend)}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-slate-500">
                    {org.lastInvoice ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Accounts Tab ─────────────────────────────────────────────────────────────

function AccountsTab({ accounts }: { accounts: BillingAccount[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {accounts.map((acc) => (
        <div key={acc.organizationId} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Building size={18} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{acc.organizationName}</h3>
                <p className="text-xs text-slate-500">{acc.billingEmail}</p>
              </div>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${acc.autoInvoice ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
              {acc.autoInvoice ? "Auto-Invoice" : "Manual"}
            </span>
          </div>

          {/* Finance row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">Outstanding</p>
              <p className={`text-base font-bold mt-0.5 ${acc.outstandingBalanceUsd > 0 ? "text-red-600" : "text-slate-800"}`}>
                {fmt(acc.outstandingBalanceUsd)}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">Est. This Month</p>
              <p className="text-base font-bold mt-0.5 text-slate-800">{fmt(acc.currentMonthEstimateUsd)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wide">Credit</p>
              <p className="text-base font-bold mt-0.5 text-emerald-700">{fmt(acc.creditBalanceUsd)}</p>
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Country</span>
              <span className="text-slate-700 font-medium">{acc.country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Currency</span>
              <span className="text-slate-700 font-medium">{acc.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Terms</span>
              <span className="text-slate-700 font-medium">Net {acc.paymentTermsDays}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Invoice Day</span>
              <span className="text-slate-700 font-medium">Day {acc.invoiceDay}</span>
            </div>
            {acc.taxId && (
              <div className="flex justify-between col-span-2">
                <span className="text-slate-400">Tax ID</span>
                <span className="text-slate-700 font-mono font-medium">{acc.taxId}</span>
              </div>
            )}
            <div className="flex justify-between col-span-2">
              <span className="text-slate-400">Contact</span>
              <span className="text-slate-700 font-medium">{acc.billingContact}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("invoices");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<BillingAccount[]>([]);
  
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  // Load billing data
  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    try {
      const invoicesPromise = billingService.getInvoices();
      const orgsPromise = organizationService.getAll();
      const [liveInvoicesResult, realOrgsResult] = await Promise.allSettled([invoicesPromise, orgsPromise]);

      if (realOrgsResult.status === "fulfilled") {
        setOrganizations(realOrgsResult.value);
        setAccounts(realOrgsResult.value.map((org: Organization) => ({
          organizationId: org.id,
          organizationName: org.name,
          billingEmail: `billing@${org.slug || org.id}.com`,
          billingContact: "Primary Contact",
          billingAddress: "Address Not Provided",
          country: "Unknown",
          currency: "USD",
          paymentTermsDays: 15,
          taxId: "TAX-" + org.id.substring(0, 6).toUpperCase(),
          autoInvoice: true,
          invoiceDay: 1,
          currentMonthEstimateUsd: 0,
          outstandingBalanceUsd: 0,
          creditBalanceUsd: 0,
          paymentHistory: [],
        })));
      } else {
        console.error("Failed to fetch organizations:", (realOrgsResult as PromiseRejectedResult).reason);
        setOrganizations([]);
        setAccounts([]);
      }

      if (liveInvoicesResult.status === "fulfilled" && Array.isArray(liveInvoicesResult.value)) {
        setInvoices(liveInvoicesResult.value);
      } else {
        console.error("Failed to fetch invoices:", (liveInvoicesResult as PromiseRejectedResult).reason);
        setInvoices([]);
      }
    } catch (error) {
      console.error("Error fetching billing data:", error);
      setInvoices([]);
      setAccounts([]);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  // KPIs
  const kpis = useMemo(() => {
    const thisMonth = new Date();
    const monthStr = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}`;
    const outstanding = invoices
      .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
      .reduce((s, i) => s + i.totalUsd, 0);
    const paidThisMonth = invoices
      .filter((i) => i.status === "PAID" && i.paidAt?.startsWith(monthStr))
      .reduce((s, i) => s + i.totalUsd, 0);
    const overdue = invoices.filter((i) => i.status === "OVERDUE").length;
    const drafts = invoices.filter((i) => i.status === "DRAFT").length;
    return { outstanding, paidThisMonth, overdue, drafts };
  }, [invoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !inv.organizationName.toLowerCase().includes(q) &&
          !inv.invoiceNumber.toLowerCase().includes(q)
        ) return false;
      }
      if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
      if (dateFrom && inv.issuedAt < dateFrom) return false;
      if (dateTo && inv.issuedAt > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [invoices, search, statusFilter, dateFrom, dateTo]);

  // Actions
  async function handleSend(invoiceId: string) {
    try {
      await billingService.send(invoiceId);
      toast.success("Invoice sent successfully");
      fetchBillingData(); // Re-fetch data to update state
    } catch (error) {
      console.error("Error sending invoice:", error);
      toast.error("Failed to send invoice");
    }
  }

  async function handleMarkPaid(invoiceId: string) {
    try {
      await billingService.markPaid(invoiceId);
      toast.success("Invoice marked as paid");
      fetchBillingData(); // Re-fetch data to update state
    } catch (error) {
      console.error("Error marking invoice as paid:", error);
      toast.error("Failed to mark invoice as paid");
    }
  }

  // Tab config
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "invoices", label: "Invoices", icon: <FileText size={14} /> },
    { id: "accounts", label: "Accounts", icon: <Building size={14} /> },
    { id: "revenue", label: "Revenue", icon: <TrendingUp size={14} /> },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Receipt size={18} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Billing & Invoicing</h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage invoices, billing accounts and revenue</p>
          </div>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={15} />
          Generate Invoice
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<DollarSign size={18} className="text-red-600" />}
          label="Total Outstanding"
          value={fmt(kpis.outstanding)}
          sub="Sent + Overdue invoices"
          colorClass="text-slate-900"
          iconBg="bg-red-50"
        />
        <KpiCard
          icon={<CheckCircle size={18} className="text-emerald-600" />}
          label="Paid This Month"
          value={fmt(kpis.paidThisMonth)}
          sub="March 2026"
          colorClass="text-emerald-700"
          iconBg="bg-emerald-50"
        />
        <KpiCard
          icon={<AlertCircle size={18} className="text-red-500" />}
          label="Overdue Invoices"
          value={String(kpis.overdue)}
          sub={kpis.overdue === 1 ? "1 invoice past due" : `${kpis.overdue} invoices past due`}
          colorClass={kpis.overdue > 0 ? "text-red-600" : "text-slate-900"}
          iconBg="bg-orange-50"
        />
        <KpiCard
          icon={<Clock size={18} className="text-slate-500" />}
          label="Draft Invoices"
          value={String(kpis.drafts)}
          sub="Not yet sent"
          colorClass="text-slate-800"
          iconBg="bg-slate-100"
        />
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
              ${activeTab === tab.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Invoices Tab ── */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search org or invoice #…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Status filter */}
              <div className="relative">
                <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-8 pr-8 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-700 appearance-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SENT">Sent</option>
                  <option value="PAID">Paid</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="DISPUTED">Disputed</option>
                  <option value="VOID">Void</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Date from */}
              <div className="relative">
                <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Date to */}
              <div className="relative">
                <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Clear */}
              {(search || statusFilter !== "ALL" || dateFrom || dateTo) && (
                <button
                  onClick={() => { setSearch(""); setStatusFilter("ALL"); setDateFrom(""); setDateTo(""); }}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <X size={12} />
                  Clear
                </button>
              )}

              <div className="ml-auto">
                <button
                  onClick={() => setShowGenerate(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus size={13} />
                  Generate
                </button>
              </div>
            </div>
          </div>

          {/* Invoice table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Filter size={12} />
                <span>{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}</span>
                {loading && <span className="text-blue-500">Loading…</span>}
              </div>
              <button
                onClick={async () => {
                  try {
                    const blob = await billingService.exportCsv();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "invoices.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch { toast.error("Failed to export CSV"); }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Download size={12} />
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Invoice #</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Organization</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Period</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Issued</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Due</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                        No invoices match the current filters.
                      </td>
                    </tr>
                  )}
                  {filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                      onClick={() => setSelectedInvoice(inv)}
                    >
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-semibold text-slate-700">{inv.invoiceNumber}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <Building size={11} className="text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-800 truncate max-w-[160px]">{inv.organizationName}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{inv.organizationEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {fmtPeriod(inv.periodStart, inv.periodEnd)}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {fmtDate(inv.issuedAt)}
                      </td>
                      <td className="px-5 py-3 text-xs whitespace-nowrap">
                        <span className={inv.status === "OVERDUE" ? "text-red-600 font-semibold" : "text-slate-600"}>
                          {fmtDate(inv.dueAt)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-semibold text-slate-800 whitespace-nowrap">
                        {fmt(inv.totalUsd)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {/* View button */}
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            title="View"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Eye size={13} />
                          </button>

                          {/* DRAFT: Send */}
                          {inv.status === "DRAFT" && (
                            <button
                              onClick={() => handleSend(inv.id)}
                              title="Send"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                            >
                              <Send size={11} />
                              Send
                            </button>
                          )}

                          {/* SENT: Resend */}
                          {inv.status === "SENT" && (
                            <button
                              onClick={() => handleSend(inv.id)}
                              title="Resend"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                            >
                              <Send size={11} />
                              Resend
                            </button>
                          )}

                          {/* Mark Paid: DRAFT, SENT, OVERDUE, DISPUTED */}
                          {(inv.status === "DRAFT" || inv.status === "SENT" || inv.status === "OVERDUE" || inv.status === "DISPUTED") && (
                            <button
                              onClick={() => handleMarkPaid(inv.id)}
                              title="Mark Paid"
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors
                                ${inv.status === "OVERDUE"
                                  ? "bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                                }`}
                            >
                              <CreditCard size={11} />
                              Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Total shown: <span className="font-semibold text-slate-600">{fmt(filteredInvoices.reduce((s, i) => s + i.totalUsd, 0))}</span>
              </span>
              <div className="flex items-center gap-4 text-[11px] text-slate-400">
                {(["DRAFT", "SENT", "PAID", "OVERDUE", "DISPUTED"] as InvoiceStatus[]).map((s) => {
                  const count = filteredInvoices.filter((i) => i.status === s).length;
                  return count > 0 ? (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${s === "PAID" ? "bg-emerald-500" : s === "OVERDUE" ? "bg-red-500" : s === "SENT" ? "bg-blue-500" : s === "DISPUTED" ? "bg-orange-500" : "bg-slate-400"}`} />
                      {count} {STATUS_CONFIG[s].label}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Accounts Tab ── */}
      {activeTab === "accounts" && <AccountsTab accounts={accounts} />}

      {/* ── Revenue Tab ── */}
      {activeTab === "revenue" && <RevenueTab invoices={invoices} />}

      {/* ── Invoice Detail Modal ── */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onSend={handleSend}
          onMarkPaid={handleMarkPaid}
        />
      )}

      {/* ── Generate Invoice Modal ── */}
      {showGenerate && (
        <GenerateInvoiceModal
          organizations={organizations}
          onClose={() => setShowGenerate(false)}
          onGenerated={fetchBillingData}
        />
      )}
    </div>
  );
}
