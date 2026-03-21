// ============================================================
// ZGATE Nexus — Core Types
// ============================================================

export type DeploymentStatus = "HEALTHY" | "DEGRADED" | "OFFLINE" | "PROVISIONING" | "MAINTENANCE";
export type LicenseStatus = "ACTIVE" | "EXPIRED" | "NOT_LICENSED";
export type ReleaseChannel = "STABLE" | "LTS" | "BETA" | "HOTFIX";
export type DeploymentEnv = "PRODUCTION" | "STAGING" | "DEVELOPMENT";
export type PartnerTier = "PLATINUM" | "GOLD" | "SILVER" | "BRONZE" | "RESELLER" | "ENTERPRISE" | "STANDARD" | "STARTER" | "FREE";
export type DeploymentType = "DOCKER_COMPOSE" | "KUBERNETES" | "BARE_METAL" | "CLOUD_VM";

// -------------------------------------------------------
// Organization / Deployment
// -------------------------------------------------------
export interface Organization {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  country: string;
  tier: PartnerTier;
  status: DeploymentStatus;
  environment: DeploymentEnv;
  deployedVersion: string;
  backendUrl: string;
  lastSeen?: string;
  createdAt: string;
  licensedModules: string[];
  activeUsers: number;
  partnerId?: string;
  deploymentType?: DeploymentType;
  infrastructure?: InfrastructureConfig;
}

// -------------------------------------------------------
// License
// -------------------------------------------------------
export interface License {
  id: string;
  organizationId: string;
  organizationName: string;
  moduleId: string;
  moduleName: string;
  status: LicenseStatus;
  licenseKey?: string;
  expiryDate?: string;
  activatedAt?: string;
  maxUsers: number;
  features?: string;
  licenseFileHash?: string;
  fingerprint?: string;
}

export interface LicenseBundle {
  organizationId: string;
  organizationName: string;
  licenses: License[];
  expiresAt: string;
  issuedAt: string;
  licenseId: string;
}

// -------------------------------------------------------
// Software Release
// -------------------------------------------------------
export interface SoftwareRelease {
  id: string;
  version: string;
  channel: ReleaseChannel;
  releaseNotes: string;
  dockerTag: string;
  dockerRegistry: string;
  publishedAt: string;
  publishedBy: string;
  isLatest: boolean;
  isLts: boolean;
  modules: string[];
  breakingChanges: boolean;
  requiredMigrations: string[];
}

export interface Deployment {
  id: string;
  organizationId: string;
  organizationName: string;
  releaseVersion: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "ROLLED_BACK";
  startedAt: string;
  completedAt?: string;
  deployedBy: string;
  previousVersion: string;
  rollbackAvailable: boolean;
  logs?: string;
}

// -------------------------------------------------------
// Partner
// -------------------------------------------------------
export interface Partner {
  id: string;
  name: string;
  tier: PartnerTier;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  country: string;
  region: string;
  website?: string;
  deploymentCount: number;
  activeDeployments: number;
  status: "ACTIVE" | "SUSPENDED" | "PENDING" | "CHURNED";
  joinedAt: string;
  contractExpiresAt?: string;
  revenueShare: number;
}

// -------------------------------------------------------
// Audit
// -------------------------------------------------------
export interface AuditEntry {
  id: string;
  organizationId?: string;
  organizationName?: string;
  actor: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  status: "SUCCESS" | "FAILURE" | "WARNING";
  timestamp: string;
}

// -------------------------------------------------------
// System Health
// -------------------------------------------------------
export interface ServiceHealth {
  organizationId: string;
  organizationName: string;
  backendStatus: "UP" | "DOWN" | "DEGRADED";
  databaseStatus: "UP" | "DOWN" | "DEGRADED";
  redisStatus: "UP" | "DOWN" | "DEGRADED";
  version: string;
  uptimeHours: number;
  responseTimeMs: number;
  activeUsers: number;
  lastChecked: string;
}

// -------------------------------------------------------
// Dashboard KPIs
// -------------------------------------------------------
export interface NexusDashboardStats {
  totalDeployments: number;
  healthyDeployments: number;
  degradedDeployments: number;
  offlineDeployments: number;
  totalOrganizations: number;
  activePartners: number;
  pendingLicenseRenewals: number;
  expiringLicenses: number;
  latestReleaseVersion: string;
  deploymentsPendingUpdate: number;
  totalActiveLicenses: number;
  recentDeployments: Deployment[];
  licenseAlerts: License[];
  healthSummary: ServiceHealth[];
}

// -------------------------------------------------------
// Nexus User
// -------------------------------------------------------
export interface NexusUser {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "VIEWER";
  lastLogin?: string;
  createdAt: string;
  active: boolean;
}

// -------------------------------------------------------
// Integration / Webhook
// -------------------------------------------------------
export interface NexusIntegration {
  id: string;
  name: string;
  type: "SLACK" | "EMAIL" | "WEBHOOK" | "PAGERDUTY" | "TEAMS" | "JIRA" | "GITHUB";
  enabled: boolean;
  config: Record<string, string>;
  createdAt: string;
}

// ================================================================
// INFRASTRUCTURE MANAGEMENT
// ================================================================

export type ContainerStatus = "running" | "stopped" | "restarting" | "exited" | "paused" | "created";

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  state: string;
  created: string;
  ports: PortMapping[];
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  networkRx: number;
  networkTx: number;
  restartCount: number;
  health?: "healthy" | "unhealthy" | "starting" | "none";
  organizationId?: string;
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol: "tcp" | "udp";
}

export interface InfrastructureConfig {
  deploymentType: DeploymentType;
  hostUrl: string;
  dockerRegistryUrl?: string;
  kubernetesNamespace?: string;
  containers: DockerContainer[];
  volumes: DockerVolume[];
  networks: DockerNetwork[];
  resourceLimits?: ResourceLimits;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  sizeBytes?: number;
  usedBytes?: number;
  labels?: Record<string, string>;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  containers: string[];
}

export interface ResourceLimits {
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  networkRxMbps: number;
  networkTxMbps: number;
  timestamp: string;
}

// ================================================================
// CONFIGURATION MANAGEMENT
// ================================================================

export type ConfigValueType = "string" | "number" | "boolean" | "secret" | "json";
export type ConfigCategory = "DATABASE" | "REDIS" | "SECURITY" | "EMAIL" | "STORAGE" | "FEATURES" | "INTEGRATIONS" | "APP";

export interface ConfigEntry {
  key: string;
  value: string;
  type: ConfigValueType;
  category: ConfigCategory;
  description?: string;
  required: boolean;
  isSecret: boolean;
  lastUpdated?: string;
  updatedBy?: string;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  tier: "STARTER" | "STANDARD" | "ENTERPRISE";
  entries: Partial<ConfigEntry>[];
}

export interface ConfigSnapshot {
  id: string;
  organizationId: string;
  takenAt: string;
  takenBy: string;
  note?: string;
  entryCount: number;
}

export interface EnvFile {
  organizationId: string;
  content: string;
  generatedAt: string;
}

// ================================================================
// DATABASE MANAGEMENT
// ================================================================

export type MigrationStatus = "SUCCESS" | "FAILED" | "PENDING" | "OUT_OF_ORDER" | "SUPERSEDED";

export interface FlywayMigration {
  version: string;
  description: string;
  type: string;
  script: string;
  checksum?: number;
  installedOn?: string;
  executionTime?: number;
  success: boolean;
  state: MigrationStatus;
}

export interface DatabaseHealth {
  organizationId: string;
  status: "UP" | "DOWN" | "DEGRADED";
  version: string;
  sizeBytes: number;
  activeConnections: number;
  maxConnections: number;
  pendingMigrations: number;
  lastMigrationAt?: string;
  schemas: SchemaInfo[];
  slowQueries?: number;
  replicationLag?: number;
}

export interface SchemaInfo {
  name: string;
  tableCount: number;
  sizeBytes: number;
  lastModified?: string;
}

export interface DatabaseBackup {
  id: string;
  organizationId: string;
  status: "IN_PROGRESS" | "SUCCESS" | "FAILED";
  type: "FULL" | "INCREMENTAL" | "SCHEMA_ONLY";
  startedAt: string;
  completedAt?: string;
  sizeBytes?: number;
  storagePath?: string;
  expiresAt?: string;
  triggeredBy: string;
  note?: string;
}

// ================================================================
// LOG MANAGEMENT
// ================================================================

export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
export type LogService = "BACKEND" | "DATABASE" | "REDIS" | "NGINX" | "FLYWAY" | "SYSTEM";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: LogService;
  logger?: string;
  message: string;
  thread?: string;
  organizationId?: string;
  traceId?: string;
  stackTrace?: string;
}

export interface LogQuery {
  organizationId?: string;
  service?: LogService;
  level?: LogLevel;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}

// ================================================================
// ALERT MANAGEMENT
// ================================================================

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type AlertStatus = "FIRING" | "RESOLVED" | "ACKNOWLEDGED" | "SILENCED";
export type AlertChannel = "EMAIL" | "SLACK" | "WEBHOOK" | "PAGERDUTY" | "SMS";

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  severity: AlertSeverity;
  condition: AlertCondition;
  channels: AlertChannel[];
  cooldownMinutes: number;
  organizationIds?: string[]; // null = all
  createdAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

export interface AlertCondition {
  metric: string; // e.g. "response_time_ms", "disk_usage_percent", "license_expiry_days"
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
  threshold: number;
  windowMinutes?: number;
}

export interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  organizationId?: string;
  organizationName?: string;
  message: string;
  value: number;
  threshold: number;
  firedAt: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

// ================================================================
// REPORTS
// ================================================================

export interface UsageReport {
  period: string;
  totalOrganizations: number;
  activeOrganizations: number;
  totalUsers: number;
  activeUsers: number;
  totalApiCalls: number;
  moduleUsage: ModuleUsageStat[];
  deploymentsByEnv: Record<string, number>;
  newOrganizations: number;
  churnedOrganizations: number;
}

export interface ModuleUsageStat {
  moduleId: string;
  moduleName: string;
  licensedCount: number;
  activeCount: number;
  utilizationPercent: number;
}

export interface LicenseReport {
  totalLicenses: number;
  activeLicenses: number;
  expiredLicenses: number;
  expiringIn30Days: number;
  expiringIn90Days: number;
  byModule: ModuleUsageStat[];
}

export interface DeploymentReport {
  totalDeployments: number;
  successfulDeployments: number;
  failedDeployments: number;
  averageDurationMinutes: number;
  rollbackCount: number;
  deploymentsPerVersion: Record<string, number>;
  timeline: DeploymentTimelinePoint[];
}

export interface DeploymentTimelinePoint {
  date: string;
  deployments: number;
  successes: number;
  failures: number;
}

// ================================================================
// DEPLOYMENT WIZARD
// ================================================================

export type WizardStep =
  | "type"
  | "organization"
  | "infrastructure"
  | "configuration"
  | "modules"
  | "review"
  | "deploy"
  | "license";

export interface WizardState {
  step: WizardStep;
  deploymentType: DeploymentType;
  organization: {
    name: string;
    slug: string;
    contactEmail: string;
    country: string;
    environment: DeploymentEnv;
    partnerId?: string;
  };
  infrastructure: {
    hostUrl: string;
    dbHost: string;
    dbPort: number;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    redisHost: string;
    redisPort: number;
    backendPort: number;
    dockerRegistry: string;
    releaseVersion: string;
  };
  configuration: Record<string, string>;
  selectedModules: string[];
  generatedArtifacts?: {
    dockerCompose?: string;
    envFile?: string;
    k8sManifest?: string;
    licenseScript?: string;
  };
}

// ================================================================
// SHARED CENTRALIZED SERVICES (ZGATE API Marketplace)
// ================================================================

export type ServiceCategory =
  | "IDENTITY_VERIFICATION"
  | "SANCTION_SCREENING"
  | "KYC_AML"
  | "CREDIT_BUREAU"
  | "COMMUNICATION"
  | "FRAUD_DETECTION";

export type ServiceStatus = "ACTIVE" | "INACTIVE" | "BETA" | "DEPRECATED" | "MAINTENANCE";
export type PricingModel = "PER_CALL" | "TIERED" | "MONTHLY_FLAT" | "VOLUME_DISCOUNT";
export type ServiceRegion = "GLOBAL" | "AFRICA" | "NIGERIA" | "SOUTH_AFRICA" | "KENYA" | "GHANA" | "MENA" | "EU";

export interface SharedService {
  id: string;
  name: string;
  code: string;               // e.g. "NIN_LOOKUP", "BVN_VERIFY", "OFAC_SCREEN"
  category: ServiceCategory;
  description: string;
  longDescription?: string;
  status: ServiceStatus;
  regions: ServiceRegion[];   // which regions this service is available in
  provider: string;           // underlying data provider name
  pricingModel: PricingModel;
  basePricePerCall: number;   // in USD cents
  currency: "USD" | "NGN" | "ZAR" | "KES" | "GHS";
  tiers?: PricingTier[];
  slaMs?: number;             // target response time SLA in ms
  uptime99?: number;          // uptime SLA e.g. 99.9
  sampleRequest?: string;     // JSON sample
  sampleResponse?: string;    // JSON sample
  docsUrl?: string;
  totalCallsAllTime: number;
  activeSubscribers: number;
  createdAt: string;
}

export interface PricingTier {
  fromCalls: number;
  toCalls?: number;           // null = unlimited
  pricePerCall: number;       // USD cents
  label: string;              // e.g. "0 – 1,000 calls"
}

// Per-org enablement and configuration of a shared service
export interface OrgServiceSubscription {
  id: string;
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  enabled: boolean;
  enabledAt?: string;
  enabledBy?: string;
  monthlyCallLimit?: number;  // 0 = unlimited
  currentMonthCalls: number;
  apiKey?: string;            // org-specific key for the service
  callbackUrl?: string;
  notes?: string;
  billingContact?: string;
}

// ================================================================
// USAGE METERING
// ================================================================

export type UsagePeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ServiceUsageSummary {
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  period: string;             // e.g. "2026-03"
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalCostUsd: number;       // in dollars (not cents)
  avgResponseMs: number;
  peakCallsPerDay: number;
  peakDay: string;
}

export interface DailyUsagePoint {
  date: string;
  calls: number;
  costUsd: number;
  successRate: number;
}

export interface ServiceUsageDetail {
  summary: ServiceUsageSummary;
  dailyBreakdown: DailyUsagePoint[];
}

export interface PlatformUsageStats {
  totalCallsThisMonth: number;
  totalRevenueThisMonth: number;   // USD
  totalCallsAllTime: number;
  totalRevenueAllTime: number;
  activeSubscriptions: number;
  topServices: { serviceCode: string; serviceName: string; calls: number; revenue: number }[];
  topOrganizations: { orgId: string; orgName: string; calls: number; spend: number }[];
  callsOverTime: DailyUsagePoint[];
}

// ================================================================
// INVOICING & BILLING
// ================================================================

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "VOID" | "DISPUTED";
export type PaymentMethod = "BANK_TRANSFER" | "CARD" | "CRYPTO" | "MOBILE_MONEY" | "CREDIT";

export interface Invoice {
  id: string;
  invoiceNumber: string;      // e.g. "INV-2026-03-FNB-001"
  organizationId: string;
  organizationName: string;
  organizationEmail: string;
  status: InvoiceStatus;
  periodStart: string;        // ISO date
  periodEnd: string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  subtotalUsd: number;
  taxPercent: number;
  taxAmountUsd: number;
  totalUsd: number;
  currency: string;
  exchangeRate?: number;      // if billing in local currency
  totalLocal?: number;
  lineItems: InvoiceLineItem[];
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  notes?: string;
  sentAt?: string;
  reminderSentAt?: string;
  disputeReason?: string;
}

export interface InvoiceLineItem {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  callCount: number;
  unitPriceCents: number;
  subtotalUsd: number;
  pricingModel: PricingModel;
  periodLabel: string;
}

export interface BillingAccount {
  organizationId: string;
  organizationName: string;
  billingEmail: string;
  billingContact: string;
  billingAddress?: string;
  country: string;
  currency: string;
  paymentTermsDays: number;   // e.g. 30
  taxId?: string;
  autoInvoice: boolean;
  invoiceDay: number;         // day of month invoices are generated
  currentMonthEstimateUsd: number;
  outstandingBalanceUsd: number;
  creditBalanceUsd: number;
  paymentHistory: PaymentRecord[];
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string;
  paidAt: string;
  confirmedBy: string;
}

// ================================================================
// PRICING MANAGEMENT
// ================================================================

export interface PricingPlan {
  id: string;
  name: string;               // "Standard", "Volume", "Enterprise"
  description: string;
  serviceOverrides: ServicePriceOverride[];
  discountPercent: number;
  minimumMonthlyUsd: number;
  assignedOrgCount: number;
}

export interface ServicePriceOverride {
  serviceId: string;
  serviceCode: string;
  customPricePerCall: number; // USD cents — overrides service default
  notes?: string;
}
