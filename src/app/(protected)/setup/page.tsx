"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Cloud,
  Layers,
  Server,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  AlertCircle,
  Upload,
  FileCode2,
  Terminal,
  Zap,
  Shield,
  Database,
  Globe,
  Package,
  BarChart3,
  DollarSign,
  Scale,
  Wallet,
  TrendingUp,
  ArrowLeftRight,
  AlertTriangle,
  Users,
  Building2,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { releaseService, licenseService, databaseService } from "@/services/nexus.service";
import type { WizardState, WizardStep, DeploymentType, DeploymentEnv, SoftwareRelease } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "type",           label: "Type" },
  { key: "organization",   label: "Organization" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "configuration",  label: "Configuration" },
  { key: "modules",        label: "Modules" },
  { key: "review",         label: "Review" },
  { key: "deploy",         label: "Deploy" },
  { key: "license",        label: "License" },
];

const STEP_INDEX: Record<WizardStep, number> = {
  type: 0, organization: 1, infrastructure: 2, configuration: 3,
  modules: 4, review: 5, deploy: 6, license: 7,
};

const COUNTRIES = [
  "South Africa", "Nigeria", "Kenya", "Ghana", "Egypt", "Ethiopia", "Tanzania",
  "Uganda", "Rwanda", "Botswana", "Zambia", "Zimbabwe", "Mozambique", "Namibia",
  "United States", "United Kingdom", "Germany", "France", "Netherlands", "UAE",
  "India", "Singapore", "Australia", "Canada", "Brazil", "Mexico",
];

const TIMEZONES = [
  "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi", "Africa/Accra",
  "Africa/Cairo", "Africa/Casablanca", "Europe/London", "Europe/Berlin",
  "America/New_York", "America/Los_Angeles", "America/Chicago",
  "Asia/Dubai", "Asia/Singapore", "Asia/Kolkata", "Australia/Sydney",
  "UTC",
];

const CURRENCIES = ["ZAR", "USD", "EUR", "GBP", "NGN", "KES", "GHS", "EGP", "AED", "INR", "SGD", "AUD"];

const MODULES: {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  core: boolean;
  requires?: string[];
}[] = [
  { id: "CRM",              name: "CRM",               description: "Client relationship and contact management",    icon: <Users size={18} />,         color: "bg-blue-500",    core: true },
  { id: "COMPLIANCE",       name: "Compliance",         description: "Regulatory and compliance workflows",           icon: <Scale size={18} />,         color: "bg-purple-500",  core: true },
  { id: "TREASURY",         name: "Treasury",           description: "Cash management and treasury operations",       icon: <Wallet size={18} />,        color: "bg-emerald-500", core: false, requires: ["CRM"] },
  { id: "FINANCIAL_CONTROL",name: "Financial Control",  description: "GL, chart of accounts and reporting",           icon: <BarChart3 size={18} />,     color: "bg-indigo-500",  core: false, requires: ["CRM"] },
  { id: "PORTFOLIO",        name: "Portfolio",          description: "Portfolio management and analytics",            icon: <TrendingUp size={18} />,    color: "bg-cyan-500",    core: false, requires: ["CRM"] },
  { id: "TRADE",            name: "Trade",              description: "Trade order management and execution",          icon: <ArrowLeftRight size={18} />,color: "bg-orange-500",  core: false, requires: ["PORTFOLIO"] },
  { id: "RISK",             name: "Risk",               description: "Risk analytics, limits and monitoring",         icon: <AlertTriangle size={18} />, color: "bg-red-500",     core: false, requires: ["PORTFOLIO"] },
  { id: "RECON",            name: "Recon",              description: "Reconciliation of positions and transactions",  icon: <CheckCircle2 size={18} />,  color: "bg-teal-500",    core: false, requires: ["CRM"] },
  { id: "MUTUAL_FUND",      name: "Mutual Fund",        description: "Mutual fund NAV, orders and distributions",    icon: <DollarSign size={18} />,    color: "bg-yellow-500",  core: false, requires: ["CRM", "COMPLIANCE"] },
  { id: "BANKING",          name: "Banking",            description: "Banking accounts and transaction processing",   icon: <Building2 size={18} />,     color: "bg-slate-600",   core: false, requires: ["CRM"] },
  { id: "DISTRIBUTION",     name: "Distribution",       description: "Distribution network and channel management",  icon: <Globe size={18} />,         color: "bg-pink-500",    core: false, requires: ["CRM"] },
];

const MODULE_BUNDLES = [
  { label: "Starter",        modules: ["CRM", "COMPLIANCE"] },
  { label: "Banking Suite",  modules: ["CRM", "COMPLIANCE", "TREASURY", "FINANCIAL_CONTROL", "BANKING"] },
  { label: "Full Platform",  modules: MODULES.map((m) => m.id) },
];

const LOCAL_STORAGE_KEY = "zgate_wizard_state";

// ─── Default state ─────────────────────────────────────────────────────────────

function buildDefaultState(): WizardState {
  return {
    step: "type",
    deploymentType: "DOCKER_COMPOSE",
    organization: {
      name: "",
      slug: "",
      contactEmail: "",
      country: "",
      environment: "PRODUCTION",
      partnerId: undefined,
    },
    infrastructure: {
      hostUrl: "",
      dbHost: "localhost",
      dbPort: 5433,
      dbName: "zgate_core",
      dbUser: "zgate",
      dbPassword: "",
      redisHost: "localhost",
      redisPort: 6380,
      backendPort: 8080,
      dockerRegistry: "registry.zgate.io",
      releaseVersion: "",
    },
    configuration: {
      jwtSecret: "",
      jwtExpiration: "24",
      adminUsername: "admin",
      adminEmail: "",
      adminPassword: "",
      smtpHost: "",
      smtpPort: "587",
      smtpUser: "",
      smtpPassword: "",
      smtpFrom: "",
      smtpFromName: "ZGATE",
      smtpTls: "true",
      appName: "ZGATE",
      frontendUrl: "",
      uploadMaxSizeMb: "50",
      defaultCurrency: "USD",
      defaultTimezone: "UTC",
    },
    selectedModules: ["CRM", "COMPLIANCE"],
    generatedArtifacts: {},
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function generateJwtSecret(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).slice(0, 64);
}

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak",   color: "bg-red-500" };
  if (score <= 3) return { score, label: "Fair",   color: "bg-amber-500" };
  if (score === 4) return { score, label: "Good",   color: "bg-blue-500" };
  return             { score, label: "Strong", color: "bg-emerald-500" };
}

function buildDockerCompose(state: WizardState): string {
  const { organization: org, infrastructure: inf, configuration: cfg } = state;
  const slug = org.slug || "zgate";
  return `version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: ${slug}-postgres
    environment:
      POSTGRES_DB: ${inf.dbName}
      POSTGRES_USER: ${inf.dbUser}
      POSTGRES_PASSWORD: ${inf.dbPassword}
    ports:
      - "${inf.dbPort}:5432"
    volumes:
      - ${slug}_postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: ${slug}-redis
    ports:
      - "${inf.redisPort}:6379"
    restart: unless-stopped

  backend:
    image: ${inf.dockerRegistry}/zgate-backend:${inf.releaseVersion || "latest"}
    container_name: ${slug}-backend
    ports:
      - "${inf.backendPort}:8080"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:${inf.dbPort}/${inf.dbName}
      - SPRING_DATASOURCE_USERNAME=${inf.dbUser}
      - SPRING_DATASOURCE_PASSWORD=${inf.dbPassword}
      - SPRING_REDIS_HOST=redis
      - SPRING_REDIS_PORT=6379
      - JWT_SECRET=${cfg.jwtSecret || "REPLACE_WITH_JWT_SECRET"}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

volumes:
  ${slug}_postgres_data:
`;
}

function buildEnvFile(state: WizardState): string {
  const { organization: org, infrastructure: inf, configuration: cfg } = state;
  return `# ZGATE Environment Configuration
# Generated: ${new Date().toISOString()}
# Organization: ${org.name}

# ── Database ──────────────────────────────────────────────
SPRING_DATASOURCE_URL=jdbc:postgresql://${inf.dbHost}:${inf.dbPort}/${inf.dbName}
SPRING_DATASOURCE_USERNAME=${inf.dbUser}
SPRING_DATASOURCE_PASSWORD=${inf.dbPassword}
SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver

# ── Redis ─────────────────────────────────────────────────
SPRING_REDIS_HOST=${inf.redisHost}
SPRING_REDIS_PORT=${inf.redisPort}

# ── Security ──────────────────────────────────────────────
JWT_SECRET=${cfg.jwtSecret}
JWT_EXPIRATION_HOURS=${cfg.jwtExpiration}
ADMIN_USERNAME=${cfg.adminUsername}
ADMIN_EMAIL=${cfg.adminEmail}
ADMIN_PASSWORD=${cfg.adminPassword}

# ── SMTP ──────────────────────────────────────────────────
SPRING_MAIL_HOST=${cfg.smtpHost}
SPRING_MAIL_PORT=${cfg.smtpPort}
SPRING_MAIL_USERNAME=${cfg.smtpUser}
SPRING_MAIL_PASSWORD=${cfg.smtpPassword}
SPRING_MAIL_FROM=${cfg.smtpFrom}
SPRING_MAIL_FROM_NAME=${cfg.smtpFromName}
SPRING_MAIL_TLS=${cfg.smtpTls}

# ── Application ───────────────────────────────────────────
APP_NAME=${cfg.appName}
FRONTEND_URL=${cfg.frontendUrl}
FILE_UPLOAD_MAX_SIZE_MB=${cfg.uploadMaxSizeMb}
DEFAULT_CURRENCY=${cfg.defaultCurrency}
DEFAULT_TIMEZONE=${cfg.defaultTimezone}

# ── Deployment ────────────────────────────────────────────
DEPLOYMENT_TYPE=${state.deploymentType}
DEPLOYMENT_ENV=${org.environment}
ORGANIZATION_SLUG=${org.slug}
LICENSED_MODULES=${state.selectedModules.join(",")}
`;
}

function buildK8sManifest(state: WizardState): string {
  const { infrastructure: inf, organization: org } = state;
  const ns    = (inf as Record<string, string | number>)["k8sNamespace"]    || "zgate";
  const rname = (inf as Record<string, string | number>)["helmReleaseName"] || "zgate";
  const slug  = org.slug || "zgate";
  return `# ZGATE Kubernetes Deployment Manifest
# Generated: ${new Date().toISOString()}

apiVersion: v1
kind: Namespace
metadata:
  name: ${ns}

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${rname}-backend
  namespace: ${ns}
spec:
  replicas: ${(inf as Record<string, string | number>)["replicaCount"] || 2}
  selector:
    matchLabels:
      app: ${slug}-backend
  template:
    metadata:
      labels:
        app: ${slug}-backend
    spec:
      containers:
        - name: backend
          image: ${inf.dockerRegistry}/zgate-backend:${inf.releaseVersion || "latest"}
          ports:
            - containerPort: 8080
          envFrom:
            - secretRef:
                name: ${rname}-secrets
          readinessProbe:
            httpGet:
              path: /api/system/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: ${rname}-backend
  namespace: ${ns}
spec:
  selector:
    app: ${slug}-backend
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${rname}-ingress
  namespace: ${ns}
spec:
  rules:
    - host: ${(inf as Record<string, string | number>)["ingressHost"] || "zgate.example.com"}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${rname}-backend
                port:
                  number: 80
`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 bg-slate-900 text-sm font-mono text-slate-200 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function SectionHeader({
  title, collapsible = false, open, onToggle,
}: {
  title: string; collapsible?: boolean; open?: boolean; onToggle?: () => void;
}) {
  return (
    <div
      className={cn("flex items-center gap-2 mb-4", collapsible && "cursor-pointer select-none")}
      onClick={collapsible ? onToggle : undefined}
    >
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">{title}</h3>
      {collapsible && (open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />)}
    </div>
  );
}

function FormField({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ─── Step 1: Deployment Type ──────────────────────────────────────────────────

function StepType({
  state, onChange,
}: {
  state: WizardState;
  onChange: (type: DeploymentType) => void;
}) {
  const options: {
    type: DeploymentType;
    icon: React.ReactNode;
    title: string;
    description: string;
    recommended?: boolean;
    color: string;
  }[] = [
    {
      type: "DOCKER_COMPOSE",
      icon: <Package size={28} />,
      title: "Local / Docker Compose",
      description: "Single server or local development using docker-compose.yml",
      recommended: true,
      color: "text-blue-600 bg-blue-100",
    },
    {
      type: "CLOUD_VM",
      icon: <Cloud size={28} />,
      title: "Cloud VM",
      description: "Deploy to a cloud virtual machine (AWS EC2, Azure VM, GCP)",
      color: "text-purple-600 bg-purple-100",
    },
    {
      type: "KUBERNETES",
      icon: <Layers size={28} />,
      title: "Kubernetes",
      description: "Production-grade K8s deployment with Helm charts",
      color: "text-cyan-600 bg-cyan-100",
    },
    {
      type: "BARE_METAL",
      icon: <Server size={28} />,
      title: "Bare Metal",
      description: "Direct installation on a physical or dedicated server",
      color: "text-slate-600 bg-slate-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">How will ZGATE be deployed?</h2>
        <p className="text-slate-500">Choose the deployment strategy that matches your infrastructure.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {options.map((opt) => {
          const selected = state.deploymentType === opt.type;
          return (
            <button
              key={opt.type}
              onClick={() => onChange(opt.type)}
              className={cn(
                "relative flex flex-col items-start gap-4 p-6 rounded-xl border-2 text-left transition-all",
                selected
                  ? "border-nexus-600 bg-nexus-50 shadow-md"
                  : "border-slate-200 bg-white hover:border-nexus-300 hover:bg-slate-50"
              )}
            >
              {opt.recommended && (
                <span className="absolute top-3 right-3 badge bg-nexus-100 text-nexus-700">
                  Recommended
                </span>
              )}
              <div className={cn("p-3 rounded-xl", opt.color)}>
                {opt.icon}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900 mb-1">{opt.title}</div>
                <div className="text-sm text-slate-500 leading-relaxed">{opt.description}</div>
              </div>
              {selected && (
                <div className="absolute top-3 left-3">
                  <div className="w-5 h-5 rounded-full bg-nexus-600 flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Organization ─────────────────────────────────────────────────────

function StepOrganization({
  state, onChange,
}: {
  state: WizardState;
  onChange: (org: WizardState["organization"]) => void;
}) {
  const org = state.organization;

  const update = useCallback(
    (field: keyof typeof org, value: string) => {
      const updated = { ...org, [field]: value };
      if (field === "name") updated.slug = slugify(value);
      onChange(updated);
    },
    [org, onChange]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Organization Details</h2>
        <p className="text-slate-500">Tell us about the organization that will use this ZGATE instance.</p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="col-span-2">
          <FormField label="Organization Name" required>
            <input
              className="input"
              placeholder="Apex Capital Management"
              value={org.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </FormField>
        </div>

        <div className="col-span-2">
          <FormField
            label="Slug"
            hint="Used in URLs and container names. Auto-generated from name, but editable."
          >
            <input
              className="input font-mono"
              placeholder="apex-capital"
              value={org.slug}
              onChange={(e) => update("slug", slugify(e.target.value))}
            />
            {org.slug && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                <Globe size={13} />
                <span>Your deployment URL: <span className="text-nexus-600 font-medium">https://{org.slug}.zgate.io</span></span>
              </div>
            )}
          </FormField>
        </div>

        <FormField label="Contact Email" required>
          <input
            className="input"
            type="email"
            placeholder="ops@example.com"
            value={org.contactEmail}
            onChange={(e) => update("contactEmail", e.target.value)}
          />
        </FormField>

        <FormField label="Contact Phone">
          <input
            className="input"
            type="tel"
            placeholder="+1 555 000 0000"
            value={(org as Record<string, string>)["contactPhone"] || ""}
            onChange={(e) => update("contactPhone" as keyof typeof org, e.target.value)}
          />
        </FormField>

        <FormField label="Country" required>
          <select
            className="select"
            value={org.country}
            onChange={(e) => update("country", e.target.value)}
          >
            <option value="">Select country…</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Environment" required>
          <select
            className="select"
            value={org.environment}
            onChange={(e) => update("environment", e.target.value as DeploymentEnv)}
          >
            <option value="PRODUCTION">PRODUCTION</option>
            <option value="STAGING">STAGING</option>
            <option value="DEVELOPMENT">DEVELOPMENT</option>
          </select>
        </FormField>

        <div className="col-span-2">
          <FormField label="Partner" hint="Leave as None for direct ZGATE customers.">
            <select
              className="select"
              value={org.partnerId || ""}
              onChange={(e) => update("partnerId" as keyof typeof org, e.target.value)}
            >
              <option value="">None / Direct</option>
            </select>
          </FormField>
        </div>
      </div>

      {org.environment === "PRODUCTION" && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <strong>Production environment selected.</strong> Ensure all credentials are strong, unique, and stored securely. CORS and JWT settings must be properly locked down before go-live.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Infrastructure ───────────────────────────────────────────────────

function StepInfrastructure({
  state, onChange,
}: {
  state: WizardState;
  onChange: (inf: WizardState["infrastructure"]) => void;
}) {
  const inf = state.infrastructure;
  const [releases, setReleases]           = useState<SoftwareRelease[]>([]);
  const [showDbPass, setShowDbPass]       = useState(false);
  const [dbTestStatus, setDbTestStatus]   = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const [extraFields, setExtraFields] = useState<Record<string, string>>({
    k8sNamespace: "zgate",
    helmReleaseName: "zgate",
    imagePullSecret: "",
    ingressHost: "",
    storageClass: "standard",
    replicaCount: "2",
    sshHost: "",
    sshUser: "ubuntu",
    sshKeyPath: "~/.ssh/id_rsa",
  });

  useEffect(() => {
    releaseService.getAvailable().then(setReleases).catch(() => {});
  }, []);

  const update = useCallback(
    (field: keyof WizardState["infrastructure"], value: string | number) => {
      onChange({ ...inf, [field]: value });
    },
    [inf, onChange]
  );

  const testDbConnection = useCallback(async () => {
    setDbTestStatus("testing");
    try {
      const res = await databaseService.testConnection();
      setDbTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setDbTestStatus("fail");
    }
  }, []);

  const isK8s    = state.deploymentType === "KUBERNETES";
  const needsSsh = state.deploymentType === "CLOUD_VM" || state.deploymentType === "BARE_METAL";

  // Persist extra fields to infrastructure as plain k/v via a workaround
  const updateExtra = useCallback((field: string, value: string) => {
    setExtraFields((prev) => {
      const next = { ...prev, [field]: value };
      onChange({ ...inf, ...(next as unknown as Partial<WizardState["infrastructure"]>) });
      return next;
    });
  }, [inf, onChange]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Infrastructure Configuration</h2>
        <p className="text-slate-500">Configure the servers and services that will host ZGATE.</p>
      </div>

      {/* Host / Server URL */}
      <div className="space-y-4">
        <SectionHeader title="Host" />
        <FormField label="Host / Server URL" hint="e.g. https://192.168.1.100 or https://zgate.mycompany.com">
          <input
            className="input"
            placeholder="https://192.168.1.100"
            value={inf.hostUrl}
            onChange={(e) => update("hostUrl", e.target.value)}
          />
        </FormField>
      </div>

      {/* K8s specific */}
      {isK8s && (
        <div className="space-y-4">
          <SectionHeader title="Kubernetes" />
          <div className="grid grid-cols-2 gap-4">
            {[
              { field: "k8sNamespace",    label: "Namespace",         placeholder: "zgate" },
              { field: "helmReleaseName", label: "Helm Release Name", placeholder: "zgate" },
              { field: "imagePullSecret", label: "Image Pull Secret", placeholder: "regcred" },
              { field: "ingressHost",     label: "Ingress Host",      placeholder: "zgate.example.com" },
              { field: "storageClass",    label: "Storage Class",     placeholder: "standard" },
              { field: "replicaCount",    label: "Replica Count (Backend)", placeholder: "2" },
            ].map(({ field, label, placeholder }) => (
              <FormField key={field} label={label}>
                <input
                  className="input"
                  placeholder={placeholder}
                  value={extraFields[field] ?? ""}
                  onChange={(e) => updateExtra(field, e.target.value)}
                />
              </FormField>
            ))}
          </div>
        </div>
      )}

      {/* SSH for Cloud VM / Bare Metal */}
      {needsSsh && (
        <div className="space-y-4">
          <SectionHeader title="SSH Connection" />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="SSH Host" required>
              <input
                className="input"
                placeholder="203.0.113.10"
                value={extraFields["sshHost"] ?? ""}
                onChange={(e) => updateExtra("sshHost", e.target.value)}
              />
            </FormField>
            <FormField label="SSH User">
              <input
                className="input"
                placeholder="ubuntu"
                value={extraFields["sshUser"] ?? ""}
                onChange={(e) => updateExtra("sshUser", e.target.value)}
              />
            </FormField>
            <FormField label="Key Path or Password">
              <input
                className="input font-mono"
                placeholder="~/.ssh/id_rsa"
                value={extraFields["sshKeyPath"] ?? ""}
                onChange={(e) => updateExtra("sshKeyPath", e.target.value)}
              />
            </FormField>
          </div>
        </div>
      )}

      {/* Database */}
      <div className="space-y-4">
        <SectionHeader title="Database (PostgreSQL)" />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Database Host" required>
            <input className="input" value={inf.dbHost}
              onChange={(e) => update("dbHost", e.target.value)} />
          </FormField>
          <FormField label="Database Port" required>
            <input className="input" type="number" value={inf.dbPort}
              onChange={(e) => update("dbPort", parseInt(e.target.value, 10))} />
          </FormField>
          <FormField label="Database Name" required>
            <input className="input" value={inf.dbName}
              onChange={(e) => update("dbName", e.target.value)} />
          </FormField>
          <FormField label="Database User" required>
            <input className="input" value={inf.dbUser}
              onChange={(e) => update("dbUser", e.target.value)} />
          </FormField>
          <div className="col-span-2">
            <FormField label="Database Password" required>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showDbPass ? "text" : "password"}
                  value={inf.dbPassword}
                  onChange={(e) => update("dbPassword", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowDbPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showDbPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </FormField>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={testDbConnection}
            disabled={dbTestStatus === "testing"}
            className="btn-secondary text-sm"
          >
            {dbTestStatus === "testing" ? (
              <><RefreshCw size={14} className="animate-spin" /> Testing…</>
            ) : (
              <><Database size={14} /> Test Database Connection</>
            )}
          </button>
          {dbTestStatus === "ok" && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <CheckCircle2 size={16} /> Connected
            </span>
          )}
          {dbTestStatus === "fail" && (
            <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
              <AlertCircle size={16} /> Failed — check host, port, and credentials
            </span>
          )}
        </div>
      </div>

      {/* Redis */}
      <div className="space-y-4">
        <SectionHeader title="Redis" />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Redis Host" required>
            <input className="input" value={inf.redisHost}
              onChange={(e) => update("redisHost", e.target.value)} />
          </FormField>
          <FormField label="Redis Port" required>
            <input className="input" type="number" value={inf.redisPort}
              onChange={(e) => update("redisPort", parseInt(e.target.value, 10))} />
          </FormField>
        </div>
      </div>

      {/* Docker / Release */}
      <div className="space-y-4">
        <SectionHeader title="Application Image" />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Backend Port" required>
            <input className="input" type="number" value={inf.backendPort}
              onChange={(e) => update("backendPort", parseInt(e.target.value, 10))} />
          </FormField>
          <FormField label="Docker Registry">
            <input className="input" value={inf.dockerRegistry}
              onChange={(e) => update("dockerRegistry", e.target.value)} />
          </FormField>
          <div className="col-span-2">
            <FormField label="Release Version">
              <select
                className="select"
                value={inf.releaseVersion}
                onChange={(e) => update("releaseVersion", e.target.value)}
              >
                <option value="">Select version…</option>
                {releases.length === 0 && (
                  <option value="latest">latest (stable)</option>
                )}
                {releases.map((r) => (
                  <option key={r.id} value={r.version}>
                    {r.version}{r.isLatest ? " (latest)" : ""}{r.isLts ? " [LTS]" : ""} — {r.channel}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Configuration ────────────────────────────────────────────────────

function StepConfiguration({
  state, onChange,
}: {
  state: WizardState;
  onChange: (cfg: WizardState["configuration"]) => void;
}) {
  const config = state.configuration;
  const [showJwt, setShowJwt]           = useState(false);
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [openSections, setOpenSections] = useState({
    security: true, email: false, application: false,
  });

  const update = useCallback(
    (field: string, value: string) => onChange({ ...config, [field]: value }),
    [config, onChange]
  );

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const fillDefaults = useCallback(() => {
    onChange({
      ...config,
      jwtExpiration: "24",
      adminUsername: "admin",
      smtpPort: "587",
      smtpFromName: "ZGATE",
      smtpTls: "true",
      appName: "ZGATE",
      uploadMaxSizeMb: "50",
      defaultCurrency: "USD",
      defaultTimezone: "UTC",
    });
    toast.success("Defaults applied");
  }, [config, onChange]);

  const pwStrength = passwordStrength(config.adminPassword || "");
  const connectionUrl = `jdbc:postgresql://${state.infrastructure.dbHost}:${state.infrastructure.dbPort}/${state.infrastructure.dbName}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Application Configuration</h2>
          <p className="text-slate-500">Set up security, email, and core application settings.</p>
        </div>
        <button type="button" onClick={fillDefaults} className="btn-secondary">
          <Zap size={14} /> Use Defaults
        </button>
      </div>

      {/* Database (read-only) */}
      <div className="card p-5 space-y-3">
        <SectionHeader title="Database" />
        <FormField label="Connection URL">
          <input className="input bg-slate-50 font-mono text-xs" readOnly value={connectionUrl} />
        </FormField>
      </div>

      {/* Security */}
      <div className="card p-5 space-y-4">
        <SectionHeader title="Security" collapsible open={openSections.security} onToggle={() => toggleSection("security")} />
        {openSections.security && (
          <div className="space-y-4">
            <FormField label="JWT Secret" required hint="Min 32 characters. Keep this secret.">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    className="input pr-10 font-mono text-xs"
                    type={showJwt ? "text" : "password"}
                    value={config.jwtSecret || ""}
                    onChange={(e) => update("jwtSecret", e.target.value)}
                    placeholder="Enter or generate a secret key…"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJwt((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showJwt ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => update("jwtSecret", generateJwtSecret())}
                  className="btn-secondary shrink-0"
                  title="Auto-generate"
                >
                  <RefreshCw size={14} /> Generate
                </button>
              </div>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="JWT Expiration (hours)">
                <input
                  className="input"
                  type="number"
                  value={config.jwtExpiration || "24"}
                  onChange={(e) => update("jwtExpiration", e.target.value)}
                />
              </FormField>
              <FormField label="Admin Username">
                <input
                  className="input"
                  value={config.adminUsername || "admin"}
                  onChange={(e) => update("adminUsername", e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="Admin Email" required>
              <input
                className="input"
                type="email"
                value={config.adminEmail || ""}
                onChange={(e) => update("adminEmail", e.target.value)}
                placeholder="admin@example.com"
              />
            </FormField>

            <FormField label="Admin Password" required>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showAdminPass ? "text" : "password"}
                  value={config.adminPassword || ""}
                  onChange={(e) => update("adminPassword", e.target.value)}
                  placeholder="Min 8 characters…"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showAdminPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {config.adminPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1 rounded-full",
                          i <= pwStrength.score ? pwStrength.color : "bg-slate-200"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Strength: <span className="font-medium">{pwStrength.label}</span></p>
                </div>
              )}
            </FormField>
          </div>
        )}
      </div>

      {/* Email */}
      <div className="card p-5 space-y-4">
        <SectionHeader title="Email / SMTP" collapsible open={openSections.email} onToggle={() => toggleSection("email")} />
        {openSections.email && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="SMTP Host">
                <input className="input" value={config.smtpHost || ""} onChange={(e) => update("smtpHost", e.target.value)} placeholder="smtp.example.com" />
              </FormField>
              <FormField label="SMTP Port">
                <input className="input" type="number" value={config.smtpPort || "587"} onChange={(e) => update("smtpPort", e.target.value)} />
              </FormField>
              <FormField label="SMTP Username">
                <input className="input" value={config.smtpUser || ""} onChange={(e) => update("smtpUser", e.target.value)} />
              </FormField>
              <FormField label="SMTP Password">
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showSmtpPass ? "text" : "password"}
                    value={config.smtpPassword || ""}
                    onChange={(e) => update("smtpPassword", e.target.value)}
                  />
                  <button type="button" onClick={() => setShowSmtpPass((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showSmtpPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </FormField>
              <FormField label="From Address">
                <input className="input" type="email" value={config.smtpFrom || ""} onChange={(e) => update("smtpFrom", e.target.value)} placeholder="noreply@example.com" />
              </FormField>
              <FormField label="From Name">
                <input className="input" value={config.smtpFromName || "ZGATE"} onChange={(e) => update("smtpFromName", e.target.value)} />
              </FormField>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-nexus-600"
                checked={config.smtpTls === "true"}
                onChange={(e) => update("smtpTls", e.target.checked ? "true" : "false")}
              />
              <span className="text-sm text-slate-700">Use TLS</span>
            </label>
          </div>
        )}
      </div>

      {/* Application */}
      <div className="card p-5 space-y-4">
        <SectionHeader title="Application" collapsible open={openSections.application} onToggle={() => toggleSection("application")} />
        {openSections.application && (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="App Name">
              <input className="input" value={config.appName || "ZGATE"} onChange={(e) => update("appName", e.target.value)} />
            </FormField>
            <FormField label="Frontend URL">
              <input className="input" value={config.frontendUrl || ""} onChange={(e) => update("frontendUrl", e.target.value)} placeholder="https://app.example.com" />
            </FormField>
            <FormField label="File Upload Max Size (MB)">
              <input className="input" type="number" value={config.uploadMaxSizeMb || "50"} onChange={(e) => update("uploadMaxSizeMb", e.target.value)} />
            </FormField>
            <FormField label="Default Currency">
              <select className="select" value={config.defaultCurrency || "USD"} onChange={(e) => update("defaultCurrency", e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <div className="col-span-2">
              <FormField label="Default Timezone">
                <select className="select" value={config.defaultTimezone || "UTC"} onChange={(e) => update("defaultTimezone", e.target.value)}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </FormField>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 5: Modules ──────────────────────────────────────────────────────────

function StepModules({
  state, onChange,
}: {
  state: WizardState;
  onChange: (modules: string[]) => void;
}) {
  const selected = state.selectedModules;

  const toggle = useCallback(
    (id: string) => {
      const mod = MODULES.find((m) => m.id === id);
      if (!mod || mod.core) return;
      if (selected.includes(id)) {
        // Remove module and any that depend on it
        const deps = MODULES.filter((m) => m.requires?.includes(id)).map((m) => m.id);
        onChange(selected.filter((s) => s !== id && !deps.includes(s)));
      } else {
        // Add module + ensure its requirements are included
        const reqs = mod.requires?.filter((r) => !selected.includes(r)) ?? [];
        onChange([...selected, ...reqs, id]);
      }
    },
    [selected, onChange]
  );

  const applyBundle = useCallback(
    (modules: string[]) => onChange([...new Set([...modules])]),
    [onChange]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Select Modules to License</h2>
        <p className="text-slate-500">Choose the functional modules for this deployment. Core modules are always included.</p>
      </div>

      {/* Bundle shortcuts */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-500">Bundles:</span>
        {MODULE_BUNDLES.map((bundle) => (
          <button
            key={bundle.label}
            onClick={() => applyBundle(bundle.modules)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-nexus-200 text-nexus-700 bg-nexus-50 hover:bg-nexus-100 transition-colors"
          >
            {bundle.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => onChange(MODULES.map((m) => m.id))}
          className="text-sm text-nexus-600 hover:underline"
        >
          Select All
        </button>
        <button
          onClick={() => onChange(MODULES.filter((m) => m.core).map((m) => m.id))}
          className="text-sm text-slate-500 hover:underline"
        >
          Deselect All
        </button>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-3 gap-4">
        {MODULES.map((mod) => {
          const isSelected = selected.includes(mod.id);
          const isCore     = mod.core;
          return (
            <button
              key={mod.id}
              onClick={() => toggle(mod.id)}
              disabled={isCore}
              className={cn(
                "relative flex flex-col gap-3 p-4 rounded-xl border-2 text-left transition-all",
                isSelected
                  ? "border-nexus-500 bg-nexus-50"
                  : "border-slate-200 bg-white hover:border-slate-300",
                isCore && "cursor-default"
              )}
            >
              <div className="flex items-center justify-between">
                <div className={cn("p-2 rounded-lg text-white", mod.color)}>
                  {mod.icon}
                </div>
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                  isSelected
                    ? "border-nexus-600 bg-nexus-600"
                    : "border-slate-300 bg-white"
                )}>
                  {isSelected && <Check size={11} className="text-white" />}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-slate-900">{mod.name}</span>
                  {isCore && <span className="badge bg-slate-100 text-slate-600">Core</span>}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{mod.description}</p>
              </div>
              {mod.requires && (
                <div className="text-xs text-slate-400">
                  Requires: {mod.requires.join(", ")}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
        <Package size={15} className="shrink-0 text-nexus-600" />
        <span>{selected.length} of {MODULES.length} modules selected</span>
      </div>
    </div>
  );
}

// ─── Step 6: Review ───────────────────────────────────────────────────────────

function StepReview({
  state, onEdit,
}: {
  state: WizardState;
  onEdit: (step: WizardStep) => void;
}) {
  const { deploymentType, organization: org, infrastructure: inf, configuration: cfg, selectedModules } = state;

  const deploymentLabels: Record<DeploymentType, string> = {
    DOCKER_COMPOSE: "Local / Docker Compose",
    CLOUD_VM:       "Cloud VM",
    KUBERNETES:     "Kubernetes",
    BARE_METAL:     "Bare Metal",
  };

  const reviewSection = (
    title: string,
    step: WizardStep,
    rows: [string, string | React.ReactNode][],
  ) => (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">{title}</h3>
        <button
          onClick={() => onEdit(step)}
          className="text-xs text-nexus-600 hover:underline font-medium flex items-center gap-1"
        >
          Edit
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between py-2 gap-4">
            <span className="text-xs text-slate-500 shrink-0 w-36">{label}</span>
            <span className="text-sm text-slate-800 text-right font-medium">{value || <span className="text-slate-400">—</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Everything looks correct?</h2>
        <p className="text-slate-500">Review all your selections before generating deployment artifacts.</p>
      </div>

      {reviewSection("Deployment Type", "type", [
        ["Type", deploymentLabels[deploymentType]],
      ])}

      {reviewSection("Organization", "organization", [
        ["Name",        org.name],
        ["Slug",        <code key="slug" className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{org.slug}</code>],
        ["Email",       org.contactEmail],
        ["Country",     org.country],
        ["Environment", (
          <span key="env" className={cn("badge", {
            "badge-green":  org.environment === "PRODUCTION",
            "badge-yellow": org.environment === "STAGING",
            "badge-blue":   org.environment === "DEVELOPMENT",
          })}>
            {org.environment}
          </span>
        )],
      ])}

      {reviewSection("Infrastructure", "infrastructure", [
        ["Host URL",      inf.hostUrl],
        ["Database",      `${inf.dbHost}:${inf.dbPort}/${inf.dbName}`],
        ["DB User",       inf.dbUser],
        ["Redis",         `${inf.redisHost}:${inf.redisPort}`],
        ["Backend Port",  String(inf.backendPort)],
        ["Version",       inf.releaseVersion || "latest"],
        ["Registry",      inf.dockerRegistry],
      ])}

      {reviewSection("Configuration", "configuration", [
        ["JWT Secret",     cfg.jwtSecret ? "●●●●●●●●●●●●" : <span key="jwt" className="text-red-500 text-xs">Not set</span>],
        ["JWT Expiry",     `${cfg.jwtExpiration}h`],
        ["Admin User",     cfg.adminUsername],
        ["Admin Email",    cfg.adminEmail],
        ["Admin Password", cfg.adminPassword ? "●●●●●●●●" : <span key="pw" className="text-red-500 text-xs">Not set</span>],
        ["App Name",       cfg.appName],
        ["Currency",       cfg.defaultCurrency],
        ["Timezone",       cfg.defaultTimezone],
      ])}

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Licensed Modules</h3>
          <button onClick={() => onEdit("modules")} className="text-xs text-nexus-600 hover:underline font-medium">Edit</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedModules.map((m) => {
            const mod = MODULES.find((mod) => mod.id === m);
            return (
              <span key={m} className={cn("badge text-white", mod?.color ?? "bg-slate-500")}>
                {mod?.name ?? m}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
        <div className="text-sm text-emerald-800">
          <strong>Ready to deploy.</strong> Click Next to generate your deployment artifacts.
        </div>
      </div>
    </div>
  );
}

// ─── Step 7: Deploy ───────────────────────────────────────────────────────────

function StepDeploy({ state, onArtifactsGenerated }: {
  state: WizardState;
  onArtifactsGenerated: (artifacts: WizardState["generatedArtifacts"]) => void;
}) {
  const [tab, setTab]             = useState<"manual" | "automated">("manual");
  const [artifactTab, setArtifactTab] = useState<"compose" | "env" | "k8s">("compose");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "checking" | "up" | "down">("idle");

  const dockerCompose = buildDockerCompose(state);
  const envFile       = buildEnvFile(state);
  const k8sManifest   = buildK8sManifest(state);

  useEffect(() => {
    onArtifactsGenerated({
      dockerCompose,
      envFile,
      k8sManifest,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyConnection = useCallback(async () => {
    setVerifyStatus("checking");
    const url = `${state.infrastructure.hostUrl || "http://localhost"}:${state.infrastructure.backendPort}/api/system/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      setVerifyStatus(res.ok ? "up" : "down");
    } catch {
      setVerifyStatus("down");
    }
  }, [state.infrastructure]);

  const { infrastructure: inf } = state;
  const host = inf.hostUrl || `http://localhost`;
  const healthUrl = `${host}:${inf.backendPort}/api/system/health`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Deploying ZGATE</h2>
        <p className="text-slate-500">Generate and apply the deployment artifacts for your chosen infrastructure.</p>
      </div>

      {/* Tab: Manual / Automated */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(["manual", "automated"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize",
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "automated" && (
        <div className="card p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto">
            <Terminal size={24} className="text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-700">Coming Soon</h3>
          <p className="text-sm text-slate-500">Automated SSH deployment will push and start your instance directly from this wizard.</p>
        </div>
      )}

      {tab === "manual" && (
        <div className="space-y-6">
          {/* Artifact tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {[
              { key: "compose" as const, label: "docker-compose.yml" },
              { key: "env"     as const, label: ".env" },
              ...(state.deploymentType === "KUBERNETES" ? [{ key: "k8s" as const, label: "k8s-manifest.yml" }] : []),
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setArtifactTab(key)}
                className={cn(
                  "px-4 py-2 text-sm font-mono font-medium border-b-2 -mb-px transition-colors",
                  artifactTab === key
                    ? "border-nexus-600 text-nexus-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {artifactTab === "compose" && <CodeBlock code={dockerCompose} label="docker-compose.yml" />}
          {artifactTab === "env"     && <CodeBlock code={envFile}       label=".env" />}
          {artifactTab === "k8s"     && <CodeBlock code={k8sManifest}   label="k8s-manifest.yml" />}

          {/* Instructions */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Deployment Instructions</h3>
            <ol className="space-y-3">
              {[
                <>Copy the <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">docker-compose.yml</code> to your server.</>,
                <>Copy the <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">.env</code> file to the same directory.</>,
                <>Run: <code className="font-mono text-xs bg-slate-900 text-emerald-400 px-2 py-1 rounded">docker compose up -d</code></>,
                <>Wait for health check: <code className="font-mono text-xs bg-slate-900 text-emerald-400 px-2 py-1 rounded">docker compose ps</code></>,
                <>Access backend at: <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">{healthUrl}</code></>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="w-6 h-6 rounded-full bg-nexus-100 text-nexus-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Verify */}
          <div className="flex items-center gap-4">
            <button
              onClick={verifyConnection}
              disabled={verifyStatus === "checking"}
              className="btn-primary"
            >
              {verifyStatus === "checking" ? (
                <><RefreshCw size={14} className="animate-spin" /> Checking…</>
              ) : (
                <><Zap size={14} /> Verify Connection</>
              )}
            </button>
            {verifyStatus === "up"   && <span className="flex items-center gap-2 text-sm text-emerald-600 font-medium"><CheckCircle2 size={16} /> Backend is UP</span>}
            {verifyStatus === "down" && <span className="flex items-center gap-2 text-sm text-red-600 font-medium"><AlertCircle size={16} /> Backend is DOWN — check your setup</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 8: License ──────────────────────────────────────────────────────────

function StepLicense({
  state,
  onComplete,
}: {
  state: WizardState;
  onComplete: () => void;
}) {
  const router = useRouter();
  const [fingerprint, setFingerprint]   = useState("");
  const [fetchingFp, setFetchingFp]     = useState(false);
  const [licenseJson, setLicenseJson]   = useState("");
  const [activating, setActivating]     = useState(false);
  const [activated, setActivated]       = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const { organization: org, selectedModules } = state;

  const fetchFingerprint = useCallback(async () => {
    if (!org?.id) { toast.error("Organisation not set — cannot fetch fingerprint"); return; }
    const moduleName = selectedModules?.[0] ?? "ZGATE";
    setFetchingFp(true);
    try {
      const data = await licenseService.getFingerprint(org.id, moduleName);
      setFingerprint(data.fingerprint);
    } catch {
      toast.error("Could not fetch fingerprint — ensure backend is running.");
    } finally {
      setFetchingFp(false);
    }
  }, [org, selectedModules]);

  const activateJson = useCallback(async () => {
    if (!licenseJson.trim()) { toast.error("Paste a license JSON first."); return; }
    setActivating(true);
    try {
      await licenseService.activateJson(licenseJson);
      setActivated(true);
      toast.success("License activated successfully!");
    } catch {
      toast.error("Activation failed — check the license JSON.");
    } finally {
      setActivating(false);
    }
  }, [licenseJson]);

  const handleFileDrop = useCallback(async (file: File) => {
    setActivating(true);
    try {
      await licenseService.activateFile(file);
      setActivated(true);
      toast.success("License file activated!");
    } catch {
      toast.error("Failed to activate license file.");
    } finally {
      setActivating(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileDrop(file);
  }, [handleFileDrop]);

  const expiresDate = "2027-12-31";
  const cliCommand = `node scripts/generate-license.js \\
  --customer "${org.name}" \\
  --modules ${selectedModules.join(",")} \\
  --expires ${expiresDate} \\
  --key ./keys/zgate-license-private.pem \\
  --fingerprint ${fingerprint || "<fingerprint>"}`;

  if (activated) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <PartyPopper size={40} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Deployment Complete!</h2>
          <p className="text-slate-500 max-w-md">
            <strong>{org.name}</strong> is now licensed and active. You can manage this deployment from the Organizations dashboard.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => router.push("/organizations")}
            className="btn-primary text-base px-6 py-2.5"
          >
            <Building2 size={18} /> Go to Organizations
          </button>
          <button
            onClick={onComplete}
            className="btn-secondary text-base px-6 py-2.5"
          >
            Set up another deployment
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-center">
          {selectedModules.map((m) => {
            const mod = MODULES.find((mod) => mod.id === m);
            return (
              <div key={m} className={cn("badge text-white text-sm px-4 py-2", mod?.color ?? "bg-slate-500")}>
                {mod?.name ?? m}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Activate your Deployment</h2>
        <p className="text-slate-500">Generate a license file for this deployment and upload it to activate.</p>
      </div>

      {/* Org / fingerprint */}
      <div className="card p-5 space-y-4">
        <SectionHeader title="Deployment Identity" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Organization</p>
            <p className="font-semibold text-slate-900">{org.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Environment</p>
            <span className={cn("badge", {
              "badge-green":  org.environment === "PRODUCTION",
              "badge-yellow": org.environment === "STAGING",
              "badge-blue":   org.environment === "DEVELOPMENT",
            })}>
              {org.environment}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-2">Deployment Fingerprint</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 min-h-[40px] flex items-center">
              {fingerprint || <span className="text-slate-400 italic">Not yet fetched</span>}
            </code>
            <button
              onClick={fetchFingerprint}
              disabled={fetchingFp}
              className="btn-secondary shrink-0"
            >
              {fetchingFp ? <RefreshCw size={14} className="animate-spin" /> : <Fingerprint size={14} />}
              {fetchingFp ? "Fetching…" : "Fetch Fingerprint"}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-2">Licensed Modules</p>
          <div className="flex flex-wrap gap-2">
            {selectedModules.map((m) => {
              const mod = MODULES.find((mod) => mod.id === m);
              return (
                <span key={m} className={cn("badge text-white", mod?.color ?? "bg-slate-500")}>
                  {mod?.name ?? m}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* CLI command */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Generate License (CLI)</h3>
        <p className="text-xs text-slate-500">Run this command on the ZGATE license server to produce a <code className="font-mono">.lic</code> file:</p>
        <CodeBlock code={cliCommand} label="Terminal" />
      </div>

      {/* Upload */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Upload License File</h3>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
            dragOver
              ? "border-nexus-500 bg-nexus-50"
              : "border-slate-300 bg-slate-50 hover:border-nexus-400 hover:bg-slate-100"
          )}
        >
          <Upload size={28} className={dragOver ? "text-nexus-600" : "text-slate-400"} />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">Drop your <code className="font-mono text-xs">.lic</code> file here</p>
            <p className="text-xs text-slate-500 mt-1">or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".lic,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileDrop(file);
            }}
          />
        </div>
      </div>

      {/* Or paste JSON */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Or Paste License JSON</h3>
        <textarea
          rows={6}
          className="input font-mono text-xs resize-y"
          placeholder='{ "licenseId": "...", "modules": [...], ... }'
          value={licenseJson}
          onChange={(e) => setLicenseJson(e.target.value)}
        />
        <button
          onClick={activateJson}
          disabled={activating || !licenseJson.trim()}
          className="btn-primary"
        >
          {activating ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />}
          {activating ? "Activating…" : "Activate License"}
        </button>
      </div>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const current = STEP_INDEX[currentStep];
  return (
    <div className="flex items-center w-full">
      {WIZARD_STEPS.map((step, i) => {
        const isDone    = i < current;
        const isCurrent = i === current;
        const isUpcoming = i > current;
        return (
          <div key={step.key} className={cn("flex items-center", i < WIZARD_STEPS.length - 1 && "flex-1")}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                isDone    ? "bg-nexus-600 text-white"      : "",
                isCurrent ? "bg-nexus-600 text-white ring-4 ring-nexus-100" : "",
                isUpcoming ? "bg-slate-200 text-slate-500" : "",
              )}>
                {isDone ? <Check size={14} /> : i + 1}
              </div>
              <span className={cn(
                "text-xs font-medium whitespace-nowrap",
                isCurrent ? "text-nexus-700" : isDone ? "text-slate-600" : "text-slate-400"
              )}>
                {step.label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={cn("flex-1 h-0.5 mx-2 mt-[-14px]", i < current ? "bg-nexus-600" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateStep(step: WizardStep, state: WizardState): string | null {
  const { organization: org, infrastructure: inf, configuration: cfg } = state;
  switch (step) {
    case "type":
      return null;
    case "organization":
      if (!org.name.trim())         return "Organization name is required.";
      if (!org.slug.trim())         return "Slug is required.";
      if (!org.contactEmail.trim()) return "Contact email is required.";
      if (!org.country)             return "Country is required.";
      return null;
    case "infrastructure":
      if (!inf.dbHost)       return "Database host is required.";
      if (!inf.dbName)       return "Database name is required.";
      if (!inf.dbUser)       return "Database user is required.";
      if (!inf.dbPassword)   return "Database password is required.";
      if (!inf.redisHost)    return "Redis host is required.";
      return null;
    case "configuration":
      if (!cfg.jwtSecret || cfg.jwtSecret.length < 32) return "JWT secret must be at least 32 characters.";
      if (!cfg.adminEmail)    return "Admin email is required.";
      if (!cfg.adminPassword || cfg.adminPassword.length < 8) return "Admin password must be at least 8 characters.";
      return null;
    case "modules":
      if (state.selectedModules.length === 0) return "Select at least one module.";
      return null;
    default:
      return null;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SetupWizardPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) return JSON.parse(saved) as WizardState;
      } catch { /* ignore */ }
    }
    return buildDefaultState();
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Auto-save
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  const currentIndex = STEP_INDEX[state.step];

  const goToStep = useCallback((step: WizardStep) => {
    setValidationError(null);
    setState((prev) => ({ ...prev, step }));
  }, []);

  const handleNext = useCallback(() => {
    const error = validateStep(state.step, state);
    if (error) { setValidationError(error); return; }
    setValidationError(null);
    const nextIndex = currentIndex + 1;
    if (nextIndex < WIZARD_STEPS.length) {
      setState((prev) => ({ ...prev, step: WIZARD_STEPS[nextIndex].key }));
    }
  }, [state, currentIndex]);

  const handleBack = useCallback(() => {
    setValidationError(null);
    if (currentIndex > 0) {
      setState((prev) => ({ ...prev, step: WIZARD_STEPS[currentIndex - 1].key }));
    }
  }, [currentIndex]);

  const handleCancel = useCallback(() => {
    if (typeof window !== "undefined") localStorage.removeItem(LOCAL_STORAGE_KEY);
    router.push("/organizations");
  }, [router]);

  const handleComplete = useCallback(() => {
    if (typeof window !== "undefined") localStorage.removeItem(LOCAL_STORAGE_KEY);
    setState(buildDefaultState());
  }, []);

  const isLastStep = currentIndex === WIZARD_STEPS.length - 1;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-nexus-600 flex items-center justify-center">
            <FileCode2 size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">New Deployment Wizard</h1>
            <p className="text-xs text-slate-500">
              Step {currentIndex + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[currentIndex].label}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <X size={16} /> Cancel
        </button>
      </div>

      {/* Cancel confirm dialog */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="card p-6 w-full max-w-sm space-y-4 mx-4">
            <h2 className="font-bold text-slate-900">Discard this setup?</h2>
            <p className="text-sm text-slate-600">Your progress is saved locally. You can resume it next time. Clicking Discard will clear it permanently.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCancelConfirm(false)} className="btn-secondary">
                Keep editing
              </button>
              <button onClick={handleCancel} className="btn-danger">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Step indicator */}
        <StepIndicator currentStep={state.step} />

        {/* Validation error */}
        {validationError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" />
            {validationError}
          </div>
        )}

        {/* Step content */}
        <div className="card p-8 min-h-[480px]">
          {state.step === "type" && (
            <StepType
              state={state}
              onChange={(type) => setState((prev) => ({ ...prev, deploymentType: type }))}
            />
          )}
          {state.step === "organization" && (
            <StepOrganization
              state={state}
              onChange={(org) => setState((prev) => ({ ...prev, organization: org }))}
            />
          )}
          {state.step === "infrastructure" && (
            <StepInfrastructure
              state={state}
              onChange={(inf) => setState((prev) => ({ ...prev, infrastructure: inf }))}
            />
          )}
          {state.step === "configuration" && (
            <StepConfiguration
              state={state}
              onChange={(cfg) => setState((prev) => ({ ...prev, configuration: cfg }))}
            />
          )}
          {state.step === "modules" && (
            <StepModules
              state={state}
              onChange={(modules) => setState((prev) => ({ ...prev, selectedModules: modules }))}
            />
          )}
          {state.step === "review" && (
            <StepReview
              state={state}
              onEdit={(step) => goToStep(step)}
            />
          )}
          {state.step === "deploy" && (
            <StepDeploy
              state={state}
              onArtifactsGenerated={(artifacts) =>
                setState((prev) => ({ ...prev, generatedArtifacts: artifacts }))
              }
            />
          )}
          {state.step === "license" && (
            <StepLicense
              state={state}
              onComplete={handleComplete}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pb-8">
          <button
            onClick={handleBack}
            disabled={currentIndex === 0}
            className={cn(
              "btn-secondary",
              currentIndex === 0 && "opacity-0 pointer-events-none"
            )}
          >
            <ChevronLeft size={16} /> Back
          </button>

          <div className="flex items-center gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  i === currentIndex ? "bg-nexus-600 w-4" : i < currentIndex ? "bg-nexus-300" : "bg-slate-200"
                )}
              />
            ))}
          </div>

          {!isLastStep ? (
            <button onClick={handleNext} className="btn-primary">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={() => router.push("/organizations")} className="btn-primary">
              Finish <Check size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
