/**
 * ZGATE Control Center — API Service Layer
 * Base URL: NEXT_PUBLIC_API_URL (default: http://localhost:8090)
 * All paths match com.zgate.controlcenter.controller.* at /api/v1/
 */

import axios, { AxiosInstance } from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8090";
const V1 = "/api/v1";

function createClient(): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL, timeout: 20000 });

  client.interceptors.request.use((config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("controlcenter_token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (r) => r,
    (err) => {
      if (err.response?.status === 401 && typeof window !== "undefined") {
        localStorage.removeItem("controlcenter_token");
        document.cookie = "controlcenter_token=; path=/; max-age=0";
        window.location.href = "/login";
      }
      return Promise.reject(err);
    }
  );

  return client;
}

const api = createClient();

// ============================================================
// Normalization helpers — bridge backend field names to
// the frontend TypeScript types in @/types/index.ts
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRelease(r: any) {
  if (!r) return r;
  let requiredMigrations: string[] = [];
  if (Array.isArray(r.requiredMigrations)) {
    requiredMigrations = r.requiredMigrations;
  } else if (typeof r.migrations === "string" && r.migrations) {
    try { requiredMigrations = JSON.parse(r.migrations); } catch { requiredMigrations = []; }
  } else if (Array.isArray(r.migrations)) {
    requiredMigrations = r.migrations;
  }
  return {
    ...r,
    breakingChanges: r.breakingChanges ?? r.hasBreakingChanges ?? false,
    requiredMigrations,
    modules: r.modules ?? [],
    isLts: r.isLts ?? r.channel === "LTS",
    isLatest: r.isLatest ?? r.latest ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReleaseList(list: any) {
  return Array.isArray(list) ? list.map(normalizeRelease) : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePartner(p: any) {
  if (!p) return p;
  return {
    ...p,
    name: p.name ?? p.companyName ?? "",
    revenueShare: p.revenueShare ?? p.revenueSharePercent ?? 0,
    contractExpiresAt: p.contractExpiresAt ?? p.contractExpiry ?? null,
    joinedAt: p.joinedAt ?? p.createdAt ?? new Date().toISOString(),
    deploymentCount: p.deploymentCount ?? 0,
    activeDeployments: p.activeDeployments ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePartnerList(list: any) {
  return Array.isArray(list) ? list.map(normalizePartner) : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDeployment(d: any) {
  if (!d) return d;
  return {
    ...d,
    releaseVersion: d.releaseVersion ?? d.toVersion ?? "",
    previousVersion: d.previousVersion ?? d.fromVersion ?? "",
    organizationName: d.organizationName ?? d.organizationId ?? "",
    rollbackAvailable:
      d.rollbackAvailable ??
      ((d.status === "SUCCESS" || d.status === "FAILED") && !!(d.fromVersion ?? d.previousVersion)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDeploymentList(list: any) {
  return Array.isArray(list) ? list.map(normalizeDeployment) : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLicense(l: any) {
  if (!l) return l;
  return {
    ...l,
    expiryDate: l.expiryDate ?? l.expiresAt ?? null,
    moduleName: l.moduleName ?? l.module_name ?? "",
    moduleId: l.moduleId ?? l.moduleName ?? "",
    organizationName: l.organizationName ?? l.organizationId ?? "",
    maxUsers: l.maxUsers ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLicenseList(list: any) {
  return Array.isArray(list) ? list.map(normalizeLicense) : [];
}

/**
 * Map an Organization's deploymentStatus to ServiceHealth-compatible backendStatus.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orgToServiceHealth(org: any) {
  const statusMap: Record<string, "UP" | "DOWN" | "DEGRADED"> = {
    HEALTHY:      "UP",
    DEGRADED:     "DEGRADED",
    OFFLINE:      "DOWN",
    PROVISIONING: "DOWN",
    SUSPENDED:    "DOWN",
  };
  const envMap: Record<string, string> = {
    PRODUCTION:  "PRODUCTION",
    STAGING:     "STAGING",
    LOCAL:       "DEVELOPMENT",
    DEVELOPMENT: "DEVELOPMENT",
  };
  const backendStatus = statusMap[org.deploymentStatus] ?? "DOWN";
  const dbStatus: "UP" | "DOWN" | "DEGRADED" = backendStatus === "DOWN" ? "DOWN" : "UP";
  const redisStatus: "UP" | "DOWN" | "DEGRADED" = backendStatus === "DOWN" ? "DOWN" : "UP";

  return {
    id: org.id,
    organizationId: org.id,
    organizationName: org.name,
    environment: envMap[org.deploymentEnv ?? org.deployment_env] ?? "PRODUCTION",
    backendStatus,
    databaseStatus: dbStatus,
    redisStatus,
    version: org.deployedVersion ?? org.deployed_version ?? "—",
    uptimeHours: backendStatus === "UP" ? 720 : 0,
    responseTimeMs: backendStatus === "UP" ? 0 : 0,
    activeUsers: org.activeUsers ?? org.active_users ?? 0,
    lastChecked: org.lastSeenAt ?? org.last_seen_at ?? org.updatedAt ?? org.updated_at ?? new Date().toISOString(),
    // Extra field for health page DeploymentHealth interface
    uptime: backendStatus === "UP" ? 99.9 : backendStatus === "DEGRADED" ? 97.5 : 0,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Spring returns Page<T> ({content,totalElements,…}) from paginated endpoints; the pages expect an
 *  array. Unwrap to .content when present, else pass through. */
function unwrapPage(d: any): any {
  return d && !Array.isArray(d) && Array.isArray(d.content) ? d.content : d;
}

/** Parse a JSON-array string (or comma list) into an array; pass arrays through. */
function parseArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; }
    catch { return v.split(",").map((s) => s.trim()).filter(Boolean); }
  }
  return [];
}

function normalizeSharedService(s: any) {
  if (!s) return s;
  return {
    ...s,
    basePricePerCall: s.basePricePerCall ?? s.pricePerCall ?? 0,
    status: s.status ?? (s.enabled === false ? "DISABLED" : "ACTIVE"),
    regions: parseArr(s.regions),
    totalCallsAllTime: s.totalCallsAllTime ?? 0,
    activeSubscribers: s.activeSubscribers ?? 0,
  };
}
/** Map a UI shared-service create/update payload to the backend entity shape. */
function denormalizeSharedService(data: any) {
  const categoryMap: Record<string, string> = {
    IDENTITY_VERIFICATION: "IDENTITY", IDENTITY: "IDENTITY",
    AML_SANCTIONS: "SANCTIONS", SANCTIONS: "SANCTIONS", KYC: "KYC",
    CREDIT_SCORING: "CREDIT", CREDIT: "CREDIT",
    COMMUNICATION: "COMMUNICATION", SMS: "COMMUNICATION", EMAIL: "COMMUNICATION",
  };
  const out: any = { ...data };
  if (data.category) out.category = categoryMap[data.category] ?? "IDENTITY";
  if (out.basePricePerCall != null && out.pricePerCall == null) out.pricePerCall = out.basePricePerCall;
  delete out.basePricePerCall; delete out.regions; delete out.totalCallsAllTime;
  delete out.activeSubscribers; delete out.createdAt;
  return out;
}
const normalizeSharedServiceList = (l: any) => (Array.isArray(l) ? l.map(normalizeSharedService) : []);

function normalizeSubscription(sub: any) {
  if (!sub) return sub;
  return {
    ...sub,
    monthlyCallLimit: sub.monthlyCallLimit ?? sub.callLimit ?? 0,
    currentMonthCalls: sub.currentMonthCalls ?? 0,
    serviceName: sub.serviceName ?? sub.serviceCode ?? sub.serviceId ?? "",
    serviceCode: sub.serviceCode ?? "",
    organizationName: sub.organizationName ?? sub.organizationId ?? "",
  };
}
const normalizeSubscriptionList = (l: any) => (Array.isArray(l) ? l.map(normalizeSubscription) : []);

function normalizeInvoice(inv: any) {
  if (!inv) return inv;
  return {
    ...inv,
    totalUsd: inv.totalUsd ?? inv.totalAmount ?? 0,
    subtotalUsd: inv.subtotalUsd ?? inv.subtotal ?? 0,
    taxAmountUsd: inv.taxAmountUsd ?? inv.taxAmount ?? 0,
    taxPercent: inv.taxPercent ?? (inv.taxRate != null ? Number(inv.taxRate) * 100 : 0),
    issuedAt: inv.issuedAt ?? inv.createdAt ?? null,
    dueAt: inv.dueAt ?? inv.dueDate ?? null,
    organizationName: inv.organizationName ?? inv.organizationId ?? "",
    organizationEmail: inv.organizationEmail ?? "",
    lineItems: Array.isArray(inv.lineItems) ? inv.lineItems : [],
  };
}
const normalizeInvoiceList = (l: any) => (Array.isArray(l) ? l.map(normalizeInvoice) : []);

function normalizeAuditLog(e: any) {
  if (!e) return e;
  return { ...e, timestamp: e.timestamp ?? e.createdAt ?? null, organizationName: e.organizationName ?? e.organizationId ?? "" };
}

function normalizeTelemetryEvent(e: any) {
  if (!e) return e;
  return { ...e, service: e.service ?? e.category ?? "", timestamp: e.timestamp ?? e.occurredAt ?? null };
}

function normalizeAlert(a: any) {
  if (!a) return a;
  return {
    ...a,
    ruleName: a.ruleName ?? a.title ?? "",
    value: a.value ?? a.metricValue ?? null,
    organizationName: a.organizationName ?? a.organizationId ?? "",
  };
}

function normalizeWebhook(w: any) {
  if (!w) return w;
  return { ...w, events: parseArr(w.events) };
}
function normalizeApiKey(k: any) {
  if (!k) return k;
  return {
    ...k,
    scopes: parseArr(k.scopes),
    keyMasked: k.keyMasked ?? (k.keyPrefix ? `${k.keyPrefix}…` : ""),
    lastUsed: k.lastUsed ?? k.lastUsedAt ?? null,
  };
}
function normalizeIntegration(i: any) {
  if (!i) return i;
  let config = i.config;
  if (!config && typeof i.configJson === "string") {
    try { config = JSON.parse(i.configJson); } catch { config = {}; }
  }
  return { ...i, type: i.type ?? (i.code ? String(i.code).toUpperCase() : ""), config: config ?? {} };
}

function normalizeConfig(c: any) {
  if (!c) return c;
  return { ...c, isSecret: c.isSecret ?? c.secret ?? false };
}
function normalizeUser(u: any) {
  if (!u) return u;
  return { ...u, lastLogin: u.lastLogin ?? u.lastLoginAt ?? null };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================
// Auth — AuthController /api/v1/auth
// ============================================================
export const authService = {
  login: (email: string, password: string) =>
    api.post(`${V1}/auth/login`, { email, password }).then((r) => r.data),
};

// ============================================================
// Organizations — OrganizationController /api/v1/organizations
// ============================================================
// The pages use friendly field names (status/environment/lastSeen); the backend entity serializes
// deploymentStatus/deploymentEnv/lastSeenAt. Map them (keeping the raw fields via spread so callers
// that read deploymentTier/maxInstances etc. still work).
/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeOrg(o: any): any {
  if (!o || typeof o !== "object") return o;
  return {
    ...o,
    status: o.status ?? o.deploymentStatus,
    environment: o.environment ?? o.deploymentEnv,
    lastSeen: o.lastSeen ?? o.lastSeenAt,
  };
}
const normalizeOrgList = (list: any): any => (Array.isArray(list) ? list.map(normalizeOrg) : list);
/* eslint-enable @typescript-eslint/no-explicit-any */

export const organizationService = {
  getAll: () => api.get(`${V1}/organizations`).then((r) => normalizeOrgList(r.data)),
  getById: (id: string) => api.get(`${V1}/organizations/${id}`).then((r) => normalizeOrg(r.data)),
  getDashboard: () => api.get(`${V1}/organizations/dashboard`).then((r) => r.data),
  create: (data: object) => api.post(`${V1}/organizations`, data).then((r) => normalizeOrg(r.data)),
  update: (id: string, data: object) =>
    api.put(`${V1}/organizations/${id}`, data).then((r) => normalizeOrg(r.data)),
  updateEntitlements: (id: string, data: object) =>
    api.patch(`${V1}/organizations/${id}/entitlements`, data).then((r) => normalizeOrg(r.data)),
  /** Rotate the M2M service key — the raw key is on `serviceApiKey` in the response (shown once). */
  regenerateKey: (id: string) =>
    api.post(`${V1}/organizations/${id}/regenerate-key`).then((r) => normalizeOrg(r.data)),
  updateStatus: (id: string, status: string) =>
    api.patch(`${V1}/organizations/${id}/status`, null, { params: { status } }).then((r) => r.data),
  /** Returns organizations adapted to ServiceHealth shape for health/dashboard pages */
  getOrgHealth: () =>
    api.get(`${V1}/organizations`).then((r) =>
      Array.isArray(r.data) ? r.data.map(orgToServiceHealth) : []
    ),
};

// ============================================================
// Partners — PartnerController /api/v1/partners
// ============================================================
export const partnerService = {
  getAll: () => api.get(`${V1}/partners`).then((r) => normalizePartnerList(r.data)),
  getById: (id: string) => api.get(`${V1}/partners/${id}`).then((r) => normalizePartner(r.data)),
  create: (data: object) => api.post(`${V1}/partners`, data).then((r) => normalizePartner(r.data)),
  update: (id: string, data: object) =>
    api.put(`${V1}/partners/${id}`, data).then((r) => normalizePartner(r.data)),
};

// ============================================================
// Licenses — LicenseController /api/v1/licenses
// ============================================================
export const licenseService = {
  getAll: () => api.get(`${V1}/licenses`).then((r) => normalizeLicenseList(r.data)),
  getByOrg: (orgId: string) => api.get(`${V1}/licenses/org/${orgId}`).then((r) => normalizeLicenseList(r.data)),
  getExpiringSoon: () => api.get(`${V1}/licenses/expiring-soon`).then((r) => normalizeLicenseList(r.data)),
  getStats: () => api.get(`${V1}/licenses/stats`).then((r) => r.data),
  issue: (data: object) => api.post(`${V1}/licenses/issue`, data).then((r) => normalizeLicense(r.data)),
  issueBulk: (data: object) => api.post(`${V1}/licenses/issue-bulk`, data).then((r) => r.data),
  deactivate: (id: string) => api.post(`${V1}/licenses/${id}/deactivate`).then((r) => r.data),
  getFingerprint: (orgId: string, moduleName: string) =>
    api.get(`${V1}/licenses/fingerprint`, { params: { orgId, moduleName } }).then((r) => r.data),
  activateFile: async (orgId: string, moduleName: string, file: File) => {
    const form = new FormData();
    form.append("orgId", orgId);
    form.append("moduleName", moduleName);
    form.append("file", file);
    const r = await api.post(`${V1}/licenses/activate-file`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return r.data;
  },
  activateJson: (orgId: string, moduleName: string, licenseJson: string) =>
    api.post(`${V1}/licenses/activate-json`, { orgId, moduleName, licenseJson }).then((r) => r.data),
  generateBundle: (licenseId: string) =>
    api.post(`${V1}/licenses/${licenseId}/generate-bundle`).then((r) => r.data),
  verifyIntegrity: (licenseId: string) =>
    api.post(`${V1}/licenses/${licenseId}/verify-integrity`).then((r) => r.data),
  verifyAll: () =>
    api.post(`${V1}/licenses/verify-all`).then((r) => r.data),
};

// ============================================================
// Releases — ReleaseController /api/v1/releases
// ============================================================
export const releaseService = {
  getAll: () => api.get(`${V1}/releases`).then((r) => normalizeReleaseList(r.data)),
  getLatest: () => api.get(`${V1}/releases/latest`).then((r) => normalizeRelease(r.data)),
  getAvailable: () => api.get(`${V1}/releases`).then((r) => normalizeReleaseList(r.data)),
  getCurrent: () => api.get(`${V1}/releases/latest`).then((r) => normalizeRelease(r.data)),
  getById: (id: string) => api.get(`${V1}/releases/${id}`).then((r) => normalizeRelease(r.data)),
  create: (data: object) => api.post(`${V1}/releases`, data).then((r) => normalizeRelease(r.data)),
  publish: (data: object) => api.post(`${V1}/releases`, data).then((r) => normalizeRelease(r.data)),
  // Deployment methods — delegate to deploymentService
  getDeployments: () => api.get(`${V1}/deployments`).then((r) => normalizeDeploymentList(r.data)),
  getPendingDeployments: () =>
    api.get(`${V1}/deployments`).then((r) =>
      normalizeDeploymentList(r.data).filter((d: { status: string }) => d.status === "PENDING")
    ),
  rollback: (deploymentId: string) =>
    api.post(`${V1}/deployments/${deploymentId}/rollback`).then((r) => r.data),
  approve: (id: string) => api.post(`${V1}/releases/${id}/approve`).then((r) => normalizeRelease(r.data)),
  reject: (id: string) => api.post(`${V1}/releases/${id}/reject`).then((r) => normalizeRelease(r.data)),
};

// ============================================================
// Deployments — DeploymentController /api/v1/deployments
// ============================================================
export const deploymentService = {
  getAll: () => api.get(`${V1}/deployments`).then((r) => normalizeDeploymentList(r.data)),
  getStats: () => api.get(`${V1}/deployments/stats`).then((r) => r.data),
  getByOrg: (orgId: string, page = 0, size = 20) =>
    api
      .get(`${V1}/deployments/org/${orgId}`, { params: { page, size } })
      .then((r) => normalizeDeploymentList(r.data?.content ?? r.data)),
  getInstances: (orgId: string) =>
    api.get(`${V1}/deployments/org/${orgId}/instances`).then((r) => r.data),
  pushUpdate: (data: object) => api.post(`${V1}/deployments/push-update`, data).then((r) => r.data),
  updateStatus: (id: string, status: string, logs?: string) =>
    api.patch(`${V1}/deployments/${id}/status`, { status, logs }).then((r) => r.data),
  rollback: (id: string) => api.post(`${V1}/deployments/${id}/rollback`).then((r) => r.data),
};

// ============================================================
// Shared Services — SharedServiceController /api/v1/shared-services
// ============================================================
export const sharedServicesCatalog = {
  getAll: () => api.get(`${V1}/shared-services`).then((r) => normalizeSharedServiceList(r.data)),
  getById: (id: string) => api.get(`${V1}/shared-services/${id}`).then((r) => normalizeSharedService(r.data)),
  create: (data: object) =>
    api.post(`${V1}/shared-services`, denormalizeSharedService(data)).then((r) => normalizeSharedService(r.data)),
  update: (id: string, data: object) =>
    api.put(`${V1}/shared-services/${id}`, denormalizeSharedService(data)).then((r) => normalizeSharedService(r.data)),

  // Org subscriptions
  getAllSubscriptions: () =>
    api.get(`${V1}/shared-services/subscriptions`).then((r) => normalizeSubscriptionList(unwrapPage(r.data))),
  getSubscriptions: (orgId: string) =>
    api.get(`${V1}/shared-services/subscriptions/${orgId}`).then((r) => normalizeSubscriptionList(unwrapPage(r.data))),
  enableForOrg: (orgId: string, serviceId: string, callLimit?: number, enabledBy?: string) =>
    api.post(`${V1}/shared-services/subscriptions/${orgId}/enable`, { serviceId, callLimit, enabledBy }).then((r) => r.data),
  disableForOrg: (orgId: string, serviceId: string) =>
    api.post(`${V1}/shared-services/subscriptions/${orgId}/disable`, null, { params: { serviceId } }).then((r) => r.data),

  // Usage
  getUsageByOrg: (orgId: string, from: string, to: string) =>
    api.get(`${V1}/shared-services/usage/${orgId}`, { params: { from, to } }).then((r) => r.data),

  // Usage tracking (called by ZGATE instances — included for completeness)
  track: (orgId: string, serviceCode: string, callCount: number, successCount: number) =>
    api.post(`${V1}/shared-services/track`, { serviceCode, callCount, successCount }, {
      headers: { "X-Control-Center-Org-Id": orgId },
    }).then((r) => r.data),
};

// ============================================================
// Billing — BillingController /api/v1/billing
// ============================================================
export const billingService = {
  getDashboard: (orgId: string) => api.get(`${V1}/billing/dashboard/${orgId}`).then((r) => r.data),
  getInvoices: () => api.get(`${V1}/billing/invoices`).then((r) => normalizeInvoiceList(unwrapPage(r.data))),
  getInvoicesByOrg: (orgId: string) =>
    api.get(`${V1}/billing/invoices/${orgId}`).then((r) => normalizeInvoiceList(unwrapPage(r.data))),
  getLineItems: (invoiceId: string) =>
    api.get(`${V1}/billing/invoices/${invoiceId}/line-items`).then((r) => r.data),
  generate: (orgId: string, periodStart: string, periodEnd: string) =>
    api.post(`${V1}/billing/invoices/generate`, { organizationId: orgId, periodStart, periodEnd }).then((r) => r.data),
  send: (invoiceId: string) => api.post(`${V1}/billing/invoices/${invoiceId}/send`).then((r) => r.data),
  markPaid: (invoiceId: string) => api.post(`${V1}/billing/invoices/${invoiceId}/pay`).then((r) => r.data),
  downloadPdf: (invoiceId: string) =>
    api.get(`${V1}/billing/invoices/${invoiceId}/pdf`, { responseType: "blob" }).then((r) => r.data),
  exportCsv: () =>
    api.get(`${V1}/billing/invoices/export/csv`, { responseType: "blob" }).then((r) => r.data),
};

// ============================================================
// Alerts — AlertController /api/v1/alerts
// ============================================================
export const alertService = {
  getRules: () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get(`${V1}/alerts/rules`).then((r): any =>
      (Array.isArray(r.data) ? r.data : []).map((rule: Record<string, unknown>) => ({
        ...rule,
        channels: parseArr(rule.channels),
        condition: rule.condition ?? { metric: rule.metric, operator: rule.operator, threshold: rule.threshold },
      })),
    ),
  createRule: (data: object) => api.post(`${V1}/alerts/rules`, data).then((r) => r.data),
  updateRule: (id: string, data: object) => api.put(`${V1}/alerts/rules/${id}`, data).then((r) => r.data),
  deleteRule: (id: string) => api.delete(`${V1}/alerts/rules/${id}`).then((r) => r.data),
  toggleRule: (id: string) => api.patch(`${V1}/alerts/rules/${id}/toggle`).then((r) => r.data),
  getActive: () => api.get(`${V1}/alerts/active`).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeAlert)),
  getAll: () => api.get(`${V1}/alerts`).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeAlert)),
  getHistory: (params?: object) =>
    api.get(`${V1}/alerts`, { params }).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeAlert)),
  acknowledge: (id: string) => api.post(`${V1}/alerts/${id}/acknowledge`).then((r) => r.data),
  resolve: (id: string) => api.post(`${V1}/alerts/${id}/resolve`).then((r) => r.data),
};

// Telemetry — TelemetryController /api/v1/telemetry
export const telemetryService = {
  search: (params?: object) =>
    api.get(`${V1}/telemetry`, { params }).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeTelemetryEvent)),
  licenseSummary: () => api.get(`${V1}/telemetry/license-summary`).then((r) => r.data),
  acknowledge: (id: string) => api.post(`${V1}/telemetry/${id}/acknowledge`).then((r) => r.data),
};

// ============================================================
// Audit — AuditController /api/v1/audit
// ============================================================
export const auditService = {
  search: (params?: {
    orgId?: string; action?: string;
    from?: string; to?: string;
    page?: number; size?: number;
  }) => api.get(`${V1}/audit`, { params }).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeAuditLog)),
  // Alias used by audit/page.tsx
  getLogs: (params?: object) =>
    api.get(`${V1}/audit`, { params }).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeAuditLog)),
  getSignInAttempts: () =>
    api.get(`${V1}/audit`, { params: { action: "LOGIN" } }).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeAuditLog)),
};

// ============================================================
// Users — UserController /api/v1/users
// ============================================================
export const userService = {
  getAll: () => api.get(`${V1}/users`).then((r) => (unwrapPage(r.data) as unknown[]).map(normalizeUser)),
  getById: (id: string) => api.get(`${V1}/users/${id}`).then((r) => normalizeUser(r.data)),
  create: (data: object) => api.post(`${V1}/users`, data).then((r) => r.data),
  update: (id: string, data: object) => api.put(`${V1}/users/${id}`, data).then((r) => r.data),
  disable: (id: string) => api.post(`${V1}/users/${id}/disable`).then((r) => r.data),
  revokeSessions: (id: string) => api.post(`${V1}/users/${id}/revoke-sessions`).then((r) => r.data),
};

// ============================================================
// Health — Spring Actuator (Control Center internal health, not org health)
// For org deployment health use organizationService.getOrgHealth()
// ============================================================
export const healthService = {
  getActuator: () => api.get("/actuator/health").then((r) => r.data),
  /**
   * Returns org deployment health (Organization[] adapted to ServiceHealth[]).
   * Pages should use this instead of getActuator() for org health monitoring.
   */
  getServices: () =>
    api.get(`${V1}/organizations`).then((r) =>
      Array.isArray(r.data) ? r.data.map(orgToServiceHealth) : []
    ),
};

// ============================================================
// Dashboard — composite fetch from multiple endpoints
// ============================================================
export const dashboardService = {
  getStats: async () => {
    const [summaryRes, latestRes, expiringRes] = await Promise.allSettled([
      api.get(`${V1}/organizations/dashboard`).then((r) => r.data),
      api.get(`${V1}/releases/latest`).then((r) => normalizeRelease(r.data)).catch(() => null),
      api.get(`${V1}/licenses/expiring-soon`).then((r) => normalizeLicenseList(r.data)).catch(() => []),
    ]);

    const s = summaryRes.status === "fulfilled" ? summaryRes.value : {};
    const latestRelease = latestRes.status === "fulfilled" ? latestRes.value : null;
    const expiringLicenses = expiringRes.status === "fulfilled" ? expiringRes.value : [];

    return {
      totalDeployments: Number(s.total ?? 0),
      healthyDeployments: Number(s.healthy ?? 0),
      degradedDeployments: Number(s.degraded ?? 0),
      offlineDeployments: Number(s.offline ?? 0),
      totalOrganizations: Number(s.total ?? 0),
      activePartners: Number(s.activePartners ?? 0),
      pendingLicenseRenewals: Number(s.expiringSoon ?? 0),
      expiringLicenses: Number(s.expiringSoon ?? 0),
      latestReleaseVersion: latestRelease?.version ?? "—",
      deploymentsPendingUpdate: Math.max(0, Number(s.total ?? 0) - Number(s.healthy ?? 0)),
      totalActiveLicenses: 0,
      recentDeployments: [],
      licenseAlerts: Array.isArray(expiringLicenses) ? expiringLicenses : [],
      healthSummary: [],
    };
  },

  getActivity: () =>
    api.get(`${V1}/audit`, { params: { page: 0, size: 10 } }).then((r) => {
      const data = r.data;
      // Audit endpoint may return a Page object or a plain array
      return Array.isArray(data) ? data : (data?.content ?? []);
    }),

  getServices: () => organizationService.getOrgHealth(),
};

// ============================================================
// Stub helper — only used for features with no backend at all
// (infrastructure containers, DB backups, log streaming)
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const notImplemented = (name: string) => (..._args: any[]): Promise<any> =>
  Promise.reject(new Error(`${name} has no backend endpoint yet`));

// ============================================================
// Config — ConfigController /api/v1/config
// ============================================================
export const configService = {
  getAll: () =>
    api.get(`${V1}/config`).then((r) => (Array.isArray(r.data) ? r.data.map(normalizeConfig) : [])),
  /** Returns config as a flat key→value map (used by settings page). */
  getMap: () =>
    api.get(`${V1}/config`).then((r) => {
      const map: Record<string, string> = {};
      if (Array.isArray(r.data)) {
        for (const entry of r.data) map[entry.key] = entry.value ?? "";
      }
      return map;
    }),
  getByKey: (key: string) =>
    api.get(`${V1}/config/${key}`).then((r) => r.data),
  getByCategory: (category: string) =>
    api.get(`${V1}/config/category/${category}`).then((r) => (Array.isArray(r.data) ? r.data.map(normalizeConfig) : [])),
  updateKey: (key: string, value: string) =>
    api.put(`${V1}/config/${key}`, { value }).then((r) => r.data),
  /** Accepts a flat Record<string,string> and transforms to List<{key,value}> for the backend. */
  updateBatch: (updates: Record<string, string>) =>
    api.post(
      `${V1}/config/batch`,
      Object.entries(updates).map(([key, value]) => ({ key, value })),
    ).then((r) => r.data),
  deleteKey: (key: string) =>
    api.delete(`${V1}/config/${key}`).then((r) => r.data),
  testRegistry: (url: string, username: string, password: string) =>
    api.post(`${V1}/config/test-registry`, { url, username, password }).then((r) => r.data),
  // Snapshots
  getSnapshots: () =>
    api.get(`${V1}/config/snapshots`).then((r) => r.data),
  takeSnapshot: (organizationId: string, note?: string) =>
    api.post(`${V1}/config/snapshots`, { organizationId, note }).then((r) => r.data),
  restoreSnapshot: (id: string) =>
    api.post(`${V1}/config/snapshots/${id}/restore`).then((r) => r.data),
  deleteSnapshot: (id: string) =>
    api.delete(`${V1}/config/snapshots/${id}`).then((r) => r.data),
};

// ============================================================
// Reports — ReportController /api/v1/reports
// ============================================================
export const reportService = {
  getSummary: () =>
    api.get(`${V1}/reports/summary`).then((r) => r.data),
  getModuleStats: () =>
    api.get(`${V1}/reports/modules`).then((r) => r.data),
  getDeploymentStats: () =>
    api.get(`${V1}/reports/deployments`).then((r) => r.data),
  // Frontend compat aliases
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUsage: (_period?: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get(`${V1}/reports/summary`).then((r): any => {
      const s = r.data ?? {};
      return {
        ...s,
        moduleUsage: Array.isArray(s.moduleUsage) ? s.moduleUsage : [],
        deploymentsByEnv: Array.isArray(s.deploymentsByEnv) ? s.deploymentsByEnv : [],
        totalUsers: s.totalUsers ?? 0,
        totalApiCalls: s.totalApiCalls ?? 0,
      };
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLicense: () =>
    api.get(`${V1}/reports/modules`).then((r): any => ({ byModule: Array.isArray(r.data) ? r.data : [] })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDeployments: () =>
    api.get(`${V1}/reports/deployments`).then((r): any => ({ timeline: Array.isArray(r.data) ? r.data : [] })),
  exportPdf: (type = "summary") =>
    api.get(`${V1}/reports/export/pdf`, { params: { type }, responseType: "blob" }).then((r) => r.data),
  exportCsv: (type = "summary") =>
    api.get(`${V1}/reports/export/csv`, { params: { type }, responseType: "blob" }).then((r) => r.data),
};

// ============================================================
// Integrations — IntegrationController /api/v1/integrations
// ============================================================
export const integrationService = {
  // Webhooks
  getWebhooks: () =>
    api.get(`${V1}/integrations/webhooks`).then((r) => (Array.isArray(r.data) ? r.data.map(normalizeWebhook) : [])),
  createWebhook: (data: object) =>
    api.post(`${V1}/integrations/webhooks`, data).then((r) => normalizeWebhook(r.data)),
  updateWebhook: (id: string, data: object) =>
    api.put(`${V1}/integrations/webhooks/${id}`, data).then((r) => r.data),
  toggleWebhook: (id: string) =>
    api.patch(`${V1}/integrations/webhooks/${id}/toggle`).then((r) => r.data),
  deleteWebhook: (id: string) =>
    api.delete(`${V1}/integrations/webhooks/${id}`).then((r) => r.data),
  getWebhookLogs: (id?: string) =>
    id
      ? api.get(`${V1}/integrations/webhooks/${id}/logs`).then((r) => r.data)
      : api.get(`${V1}/integrations/webhooks/logs`).then((r) => r.data),
  // API Keys
  getApiKeys: () =>
    api.get(`${V1}/integrations/api-keys`).then((r) => (Array.isArray(r.data) ? r.data.map(normalizeApiKey) : [])),
  createApiKey: (data: object) =>
    api.post(`${V1}/integrations/api-keys`, data).then((r) => normalizeApiKey(r.data)),
  revokeApiKey: (id: string) =>
    api.delete(`${V1}/integrations/api-keys/${id}/revoke`).then((r) => r.data),
  // 3rd-party integration catalog
  getIntegrations: () =>
    api.get(`${V1}/integrations`).then((r) => (Array.isArray(r.data) ? r.data.map(normalizeIntegration) : [])),
  toggleIntegration: (id: string) =>
    api.post(`${V1}/integrations/${id}/toggle`).then((r) => r.data),
  updateIntegrationConfig: (id: string, config: string) =>
    api.put(`${V1}/integrations/${id}/config`, { config }).then((r) => r.data),
};

// ============================================================
// Infrastructure — InfrastructureController /api/v1/infrastructure
// ============================================================
export const infrastructureService = {
  getContainers: () =>
    api.get(`${V1}/infrastructure/containers`).then((r) => r.data),
  startContainer: (id: string) =>
    api.post(`${V1}/infrastructure/containers/${id}/start`).then((r) => r.data),
  stopContainer: (id: string) =>
    api.post(`${V1}/infrastructure/containers/${id}/stop`).then((r) => r.data),
  restartContainer: (id: string) =>
    api.post(`${V1}/infrastructure/containers/${id}/restart`).then((r) => r.data),
  getContainerLogs: (id: string, tail = 200) =>
    api.get(`${V1}/infrastructure/containers/${id}/logs`, { params: { tail } }).then((r) => r.data),
  getContainerStats: () =>
    api.get(`${V1}/infrastructure/containers/stats`).then((r) => r.data),
  getConfig: () =>
    api.get(`${V1}/infrastructure/compose/config`).then((r) => r.data),
  getResourceUsage: () =>
    api.get(`${V1}/infrastructure/resources`).then((r) => r.data),
  getVolumes: () =>
    api.get(`${V1}/infrastructure/volumes`).then((r) => r.data),
  deleteVolume: (name: string) =>
    api.delete(`${V1}/infrastructure/volumes/${name}`).then((r) => r.data),
};

// ============================================================
// Database — no backend (would need direct DB host access)
// ============================================================
export const databaseService = {
  getHealth: () => api.get(`${V1}/database/health`).then((r) => r.data),
  getMigrations: () => api.get(`${V1}/database/migrations`).then((r) => r.data),
  runMigrations: () => api.post(`${V1}/database/migrations/run`).then((r) => r.data),
  validateSchema: () => api.post(`${V1}/database/schema/validate`).then((r) => r.data),
  getBackups: () => api.get(`${V1}/database/backups`).then((r) => r.data),
  createBackup: (name: string) => api.post(`${V1}/database/backups`, { name }).then((r) => r.data),
  restoreBackup: notImplemented("databaseService.restoreBackup"),
  deleteBackup: (id: string) => api.delete(`${V1}/database/backups/${id}`).then((r) => r.data),
  testConnection: () => api.post(`${V1}/database/test-connection`).then((r) => r.data),
};

// ============================================================
// Telemetry / Logs — TelemetryController /api/v1/telemetry
// ============================================================
export const logService = {
  query: (params?: {
    orgId?: string;
    level?: string;
    category?: string;
    from?: string;
    to?: string;
    acknowledged?: boolean;
    page?: number;
    size?: number;
  }) => api.get(`${V1}/telemetry`, { params }).then((r) => r.data),

  getStats: () => api.get(`${V1}/telemetry/stats`).then((r) => r.data),

  getStatsByOrg: (orgId: string) =>
    api.get(`${V1}/telemetry/stats/org/${orgId}`).then((r) => r.data),

  acknowledge: (id: string) =>
    api.post(`${V1}/telemetry/${id}/acknowledge`).then((r) => r.data),

  acknowledgeAll: (orgId?: string, level?: string) =>
    api.post(`${V1}/telemetry/acknowledge-all`, null, {
      params: { orgId, level },
    }).then((r) => r.data),

  // Called by org instances — included for completeness / SDK use
  ingest: (orgId: string, events: object[]) =>
    api.post(`${V1}/telemetry/ingest`, events, {
      headers: { "X-Control-Center-Org-Id": orgId },
    }).then((r) => r.data),

  download: (params?: {
    orgId?: string; level?: string; category?: string;
    from?: string; to?: string;
  }) => api.get(`${V1}/telemetry/export/csv`, { params, responseType: "blob" }).then((r) => r.data),

  // Legacy alias used by some pages
  getSystemLogs: (params?: object) =>
    api.get(`${V1}/telemetry`, { params }).then((r) => r.data),
};
