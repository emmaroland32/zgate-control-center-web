"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Cloud, CloudCog, ServerCog, ShieldCheck, ShieldAlert, KeyRound, Trash2,
  CheckCircle2, XCircle, Clock, RefreshCw, Terminal, AlertTriangle, Plus,
  Play, X, Copy, Database, Globe, GitCompareArrows, PlugZap, Server,
} from "lucide-react";
import {
  provisioningService, organizationService,
  type CloudCredential, type InfrastructureStack, type ProvisioningRun,
  type ProvisioningReadiness, type ProvisioningTarget, type CloudAuthMode,
  type SshCheckResult,
} from "@/services/controlcenter.service";
import type { Organization } from "@/types";
import { formatDateTime, timeAgo, cn } from "@/lib/utils";

// ---------------------------------------------------------------
// Presentation metadata
// ---------------------------------------------------------------

const TARGETS: Record<ProvisioningTarget, {
  label: string; provider: string; blurb: string; scales: boolean;
}> = {
  "aws-ecs": {
    label: "AWS ECS Fargate", provider: "aws", scales: true,
    blurb: "ALB + Fargate + RDS + ElastiCache. Scales horizontally; the production default.",
  },
  "aws-ec2": {
    label: "AWS EC2 (single node)", provider: "aws", scales: false,
    blurb: "One box running docker compose. Cheapest, no horizontal scaling, no managed failover.",
  },
  "azure-aca": {
    label: "Azure Container Apps", provider: "azure", scales: true,
    blurb: "Container Apps + PostgreSQL Flexible Server + Azure Cache. TLS included.",
  },
  "gcp-cloudrun": {
    label: "GCP Cloud Run", provider: "gcp", scales: true,
    blurb: "Cloud Run + Cloud SQL + Memorystore. TLS included.",
  },
  "baremetal": {
    label: "Your own server", provider: "baremetal", scales: false,
    blurb: "A customer-supplied Ubuntu box over SSH. Docker + Caddy for TLS; Postgres and Redis as containers unless external. No cloud account needed.",
  },
};

const STACK_STATUS: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  DRAFT:      { label: "Draft",      cls: "badge badge-gray",   icon: <Clock size={11} /> },
  PLANNING:   { label: "Planning",   cls: "badge badge-blue",   icon: <RefreshCw size={11} className="animate-spin" /> },
  PLANNED:    { label: "Planned",    cls: "badge badge-yellow", icon: <GitCompareArrows size={11} /> },
  APPLYING:   { label: "Applying",   cls: "badge badge-blue",   icon: <RefreshCw size={11} className="animate-spin" /> },
  ACTIVE:     { label: "Active",     cls: "badge badge-green",  icon: <CheckCircle2 size={11} /> },
  FAILED:     { label: "Failed",     cls: "badge badge-red",    icon: <XCircle size={11} /> },
  DESTROYING: { label: "Destroying", cls: "badge badge-red",    icon: <RefreshCw size={11} className="animate-spin" /> },
  DESTROYED:  { label: "Destroyed",  cls: "badge badge-gray",   icon: <X size={11} /> },
  DRIFTED:    { label: "Drifted",    cls: "badge badge-yellow", icon: <AlertTriangle size={11} /> },
};

const AUTH_MODES: Record<CloudAuthMode, { label: string; provider: string; secretless: boolean; hint: string }> = {
  AWS_ASSUME_ROLE: {
    label: "AWS — assume role", provider: "aws", secretless: true,
    hint: "No standing secret. The customer creates a role trusting your account, guarded by the external id generated here. Preferred.",
  },
  AWS_STATIC_KEYS: {
    label: "AWS — access keys", provider: "aws", secretless: false,
    hint: "A long-lived customer key, stored AES-256-GCM encrypted. Prefer assume-role where you can.",
  },
  AZURE_SERVICE_PRINCIPAL: {
    label: "Azure — service principal", provider: "azure", secretless: false,
    hint: "Needs Contributor plus User Access Administrator: the stack assigns roles for the app's managed identity.",
  },
  GCP_SERVICE_ACCOUNT: {
    label: "GCP — service account", provider: "gcp", secretless: false,
    hint: "Paste the whole service-account JSON key. Encrypted immediately and never returned.",
  },
  SSH_KEY: {
    label: "Your own server — SSH key", provider: "baremetal", secretless: false,
    hint: "An UNENCRYPTED SSH private key for an Ubuntu server. The login user must be root or have passwordless sudo. Pin the host key to stop anyone impersonating the server.",
  },
};

// Bare metal has no regions — the field is a free-text label for naming and tags
// only, so a short list of sensible examples beats a required dropdown.
const REGIONS: Record<string, string[]> = {
  baremetal: ["on-premise", "colo-dc1", "lagos-dc1", "customer-site"],
  aws: ["eu-west-1", "eu-west-2", "eu-central-1", "us-east-1", "us-west-2", "af-south-1", "ap-southeast-1"],
  azure: ["uksouth", "ukwest", "westeurope", "northeurope", "eastus", "southafricanorth"],
  gcp: ["europe-west1", "europe-west2", "europe-west4", "us-central1", "us-east1"],
};

// ---------------------------------------------------------------
// Readiness banner
// ---------------------------------------------------------------

function ReadinessBanner({ readiness }: { readiness: ProvisioningReadiness | null }) {
  if (!readiness || readiness.available) return null;

  // Naming exactly what is missing is the difference between a five-minute fix
  // and a support ticket, so both reasons are surfaced verbatim.
  const reasons = [readiness.runnerReason, readiness.stateReason].filter(Boolean) as string[];

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-amber-200">Provisioning is not available</p>
          {reasons.map((r) => (
            <p key={r} className="text-xs text-amber-200/80 leading-relaxed">{r}</p>
          ))}
          <p className="text-xs text-amber-200/60 pt-1">
            See <code className="font-mono">control-center/deploy/README.md</code> for the one-time vendor setup.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Credential dialog
// ---------------------------------------------------------------

function CredentialDialog({ orgs, onClose, onSaved }: {
  orgs: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [authMode, setAuthMode] = useState<CloudAuthMode>("AWS_ASSUME_ROLE");
  const [displayName, setDisplayName] = useState("");
  const [region, setRegion] = useState("eu-west-2");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CloudCredential | null>(null);

  const meta = AUTH_MODES[authMode];
  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!orgId || !displayName.trim()) {
      toast.error("Organization and a display name are required");
      return;
    }
    setSaving(true);
    try {
      const saved = await provisioningService.createCredential({
        organizationId: orgId,
        authMode,
        displayName: displayName.trim(),
        defaultRegion: region,
        ...fields,
      });
      // Assume-role returns a generated external id the customer must put in
      // their trust policy — show it before the dialog closes.
      if (saved.awsExternalId && authMode === "AWS_ASSUME_ROLE") setCreated(saved);
      else { onSaved(); onClose(); }
    } catch {
      /* interceptor toasts the backend message */
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Modal title="Credential saved — give the customer this" onClose={() => { onSaved(); onClose(); }}>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          The customer&apos;s IAM role must trust your account with this external id. It is what stops
          anyone else who can reach your provisioning identity from assuming their role.
        </p>
        <CopyRow label="External ID" value={created.awsExternalId ?? ""} />
        <CopyRow label="Role ARN" value={created.awsRoleArn ?? ""} />
        <div className="flex justify-end pt-2">
          <button className="btn btn-primary" onClick={() => { onSaved(); onClose(); }}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add cloud credential" onClose={onClose}>
      <Field label="Organization">
        <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Field>

      <Field label="Authentication">
        <select
          className="input"
          value={authMode}
          onChange={(e) => { setAuthMode(e.target.value as CloudAuthMode); setFields({}); }}
        >
          {Object.entries(AUTH_MODES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <p className={cn("text-[11px] mt-1.5 leading-relaxed",
          meta.secretless ? "text-emerald-400/80" : "text-[var(--muted)]")}>
          {meta.secretless && <ShieldCheck size={11} className="inline mr-1 -mt-0.5" />}
          {meta.hint}
        </p>
      </Field>

      <Field label="Display name">
        <input className="input" value={displayName} placeholder="Apex Capital — production account"
               onChange={(e) => setDisplayName(e.target.value)} />
      </Field>

      <Field label="Default region">
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
          {(REGIONS[meta.provider] ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>

      {authMode === "AWS_ASSUME_ROLE" && (
        <>
          <Field label="Role ARN">
            <input className="input font-mono text-xs"
                   placeholder="arn:aws:iam::210987654321:role/ZgateControlCenterProvisioner"
                   onChange={(e) => set("awsRoleArn", e.target.value)} />
          </Field>
          <Field label="AWS account ID (optional)">
            <input className="input font-mono text-xs" placeholder="210987654321"
                   onChange={(e) => set("awsAccountId", e.target.value)} />
          </Field>
        </>
      )}

      {authMode === "AWS_STATIC_KEYS" && (
        <>
          <Field label="Access key ID">
            <input className="input font-mono text-xs" placeholder="AKIA…"
                   onChange={(e) => set("awsAccessKeyId", e.target.value)} />
          </Field>
          <Field label="Secret access key">
            <input className="input font-mono text-xs" type="password" autoComplete="off"
                   onChange={(e) => set("secret", e.target.value)} />
          </Field>
        </>
      )}

      {authMode === "AZURE_SERVICE_PRINCIPAL" && (
        <>
          <Field label="Subscription ID">
            <input className="input font-mono text-xs" onChange={(e) => set("azureSubscriptionId", e.target.value)} />
          </Field>
          <Field label="Tenant ID">
            <input className="input font-mono text-xs" onChange={(e) => set("azureTenantId", e.target.value)} />
          </Field>
          <Field label="Client ID">
            <input className="input font-mono text-xs" onChange={(e) => set("azureClientId", e.target.value)} />
          </Field>
          <Field label="Client secret">
            <input className="input font-mono text-xs" type="password" autoComplete="off"
                   onChange={(e) => set("secret", e.target.value)} />
          </Field>
        </>
      )}

      {authMode === "SSH_KEY" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Server host or IP">
                <input className="input font-mono text-xs" placeholder="10.20.30.40"
                       onChange={(e) => set("sshHost", e.target.value)} />
              </Field>
            </div>
            <Field label="SSH port">
              <input className="input font-mono text-xs" placeholder="22"
                     onChange={(e) => set("sshPort", e.target.value)} />
            </Field>
          </div>
          <Field label="Login user">
            <input className="input font-mono text-xs" placeholder="ubuntu"
                   onChange={(e) => set("sshUser", e.target.value)} />
            <p className="text-[11px] text-[var(--muted)] mt-1">
              Must be root, or able to <code className="font-mono">sudo</code> without a password —
              installing Docker needs it.
            </p>
          </Field>
          <Field label="Host public key (recommended)">
            <input className="input font-mono text-[11px]" placeholder="ssh-ed25519 AAAAC3Nza..."
                   onChange={(e) => set("sshHostPublicKey", e.target.value)} />
            <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">
              From the server&apos;s <code className="font-mono">/etc/ssh/ssh_host_ed25519_key.pub</code>,
              or <code className="font-mono">ssh-keyscan -t ed25519 &lt;host&gt;</code>. Leaving it blank means
              trust-on-first-use — fine on a private link, weak over the internet. Run the reachability
              check after saving and it will show you the key to paste back.
            </p>
          </Field>
          <Field label="SSH private key">
            <textarea className="input font-mono text-[11px] h-32" autoComplete="off"
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      onChange={(e) => set("secret", e.target.value)} />
            <p className="text-[11px] text-amber-300/80 mt-1 leading-relaxed">
              Must be UNENCRYPTED — a passphrase-protected key cannot be used and is rejected on save.
              Generate a dedicated one rather than reusing a personal key:{" "}
              <code className="font-mono">ssh-keygen -t ed25519 -N &apos;&apos; -f zgate_deploy</code>
            </p>
          </Field>
        </>
      )}

      {authMode === "GCP_SERVICE_ACCOUNT" && (
        <>
          <Field label="Project ID">
            <input className="input font-mono text-xs" onChange={(e) => set("gcpProjectId", e.target.value)} />
          </Field>
          <Field label="Service account JSON key">
            <textarea className="input font-mono text-[11px] h-32" autoComplete="off"
                      placeholder='{ "type": "service_account", … }'
                      onChange={(e) => set("secret", e.target.value)} />
          </Field>
        </>
      )}

      <div className="flex justify-end gap-2 pt-3">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : "Save credential"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Reachability panel — bare metal
// ---------------------------------------------------------------

function ReachabilityPanel({ credential, onClose }: {
  credential: CloudCredential;
  onClose: () => void;
}) {
  const [result, setResult] = useState<SshCheckResult | null>(null);
  const [running, setRunning] = useState(true);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      setResult(await provisioningService.sshCheck(credential.id));
    } catch {
      /* interceptor toasts the backend message */
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [credential.id]);

  useEffect(() => { run(); }, [run]);

  const ICON = {
    ok:   <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 shrink-0" />,
    warn: <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />,
    fail: <XCircle size={13} className="text-rose-400 mt-0.5 shrink-0" />,
  };

  return (
    <Modal title={`Reachability — ${credential.sshHost ?? credential.displayName}`} onClose={onClose} wide>
      {running && (
        <p className="text-xs text-[var(--muted)] flex items-center gap-2">
          <RefreshCw size={13} className="animate-spin" /> Connecting to the server…
        </p>
      )}

      {!running && result && (
        <>
          <div className={cn(
            "rounded-md border p-3 mb-3",
            result.reachable
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-rose-500/30 bg-rose-500/10"
          )}>
            <p className={cn("text-xs font-medium", result.reachable ? "text-emerald-200" : "text-rose-200")}>
              {result.reachable
                ? "This server is ready. You can provision to it."
                : "This server cannot be deployed to yet — see the failures below."}
            </p>
          </div>

          <div className="space-y-2">
            {result.checks.map((c) => (
              <div key={c.name} className="flex items-start gap-2">
                {ICON[c.status]}
                <div className="min-w-0">
                  <span className="text-[11px] font-medium">{c.name.replace(/_/g, " ")}</span>
                  {/* Rendered verbatim: every failing check carries its own remedy. */}
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed break-words">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-[var(--muted)] mt-3">
            This check is read-only — it connects, inspects and changes nothing. Run it as often as you like.
          </p>
        </>
      )}

      <div className="flex justify-end gap-2 pt-3">
        <button className="btn btn-ghost" disabled={running} onClick={run}>
          <RefreshCw size={13} /> Re-check
        </button>
        <button className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Provision dialog
// ---------------------------------------------------------------

function ProvisionDialog({ orgs, credentials, onClose, onStarted }: {
  orgs: Organization[];
  credentials: CloudCredential[];
  onClose: () => void;
  onStarted: (stack: InfrastructureStack) => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [target, setTarget] = useState<ProvisioningTarget>("aws-ecs");
  const [environment, setEnvironment] = useState("prod");
  const [credentialId, setCredentialId] = useState("");
  const [size, setSize] = useState("medium");
  const [databaseMode, setDatabaseMode] = useState("managed");
  const [cacheMode, setCacheMode] = useState("managed");
  const [dnsMode, setDnsMode] = useState("none");
  const [domainName, setDomainName] = useState("");
  const [hostedZoneId, setHostedZoneId] = useState("");
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [alarmEmail, setAlarmEmail] = useState("");
  const [multiAz, setMultiAz] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const provider = TARGETS[target].provider;
  const usable = credentials.filter((c) => c.organizationId === orgId && c.provider === provider && c.enabled);

  useEffect(() => { setCredentialId(usable[0]?.id ?? ""); }, [orgId, target]); // eslint-disable-line react-hooks/exhaustive-deps

  // The same rules the Terraform preflight enforces, surfaced before submitting
  // rather than as a plan failure two minutes later.
  const warnings: string[] = [];
  if (environment === "prod" && dnsMode === "none" && provider === "aws") {
    warnings.push("A production AWS deployment needs TLS. With no domain it would serve session cookies over plain HTTP on the load-balancer hostname, and passkeys cannot be registered at all.");
  }
  if (cacheMode === "none" && TARGETS[target].scales) {
    warnings.push("Without Redis, sessions are not shared between replicas — users are logged out at random. Only viable at a single replica.");
  }
  if (target === "aws-ec2" && environment === "prod" && databaseMode === "managed" && !backupEnabled) {
    warnings.push("A production single-node deployment keeps the ledger in a container on one volume. Enable managed backup, or point at an external managed database.");
  }

  const submit = async () => {
    if (!credentialId) { toast.error(`No enabled ${provider} credential for this organization`); return; }
    setSubmitting(true);
    try {
      const stack = await provisioningService.provision({
        organizationId: orgId,
        target,
        environment,
        cloudCredentialId: credentialId,
        size,
        databaseMode,
        cacheMode,
        dnsMode,
        domainName: domainName || undefined,
        hostedZoneId: hostedZoneId || undefined,
        databaseMultiAz: multiAz,
        backupEnabled,
        alarmEmails: alarmEmail ? [alarmEmail] : undefined,
        deployWeb: true,
      });
      onStarted(stack);
      onClose();
    } catch {
      /* interceptor toasts the backend message */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Provision a deployment" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Organization">
          <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Environment">
          <select className="input" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
            <option value="prod">Production</option>
            <option value="staging">Staging</option>
            <option value="dev">Development</option>
          </select>
        </Field>
      </div>

      <Field label="Target">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(TARGETS) as ProvisioningTarget[]).map((t) => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className={cn(
                "text-left rounded-lg border p-3 transition",
                target === t
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:border-[var(--border-hover)]"
              )}
            >
              <div className="text-xs font-medium">{TARGETS[t].label}</div>
              <div className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">{TARGETS[t].blurb}</div>
            </button>
          ))}
        </div>
      </Field>

      <Field label={`Cloud credential (${provider})`}>
        <select className="input" value={credentialId} onChange={(e) => setCredentialId(e.target.value)}>
          {usable.length === 0 && <option value="">No enabled {provider} credential for this organization</option>}
          {usable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName} {AUTH_MODES[c.authMode].secretless ? "(assume role)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Size">
          <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="small">Small — pilot / UAT</option>
            <option value="medium">Medium — production</option>
            <option value="large">Large — high volume</option>
          </select>
        </Field>
        <Field label="Database">
          <select className="input" value={databaseMode} onChange={(e) => setDatabaseMode(e.target.value)}>
            <option value="managed">Provision one</option>
            <option value="external">Use existing</option>
          </select>
        </Field>
        <Field label="Cache">
          <select className="input" value={cacheMode} onChange={(e) => setCacheMode(e.target.value)}>
            <option value="managed">Provision one</option>
            <option value="external">Use existing</option>
            <option value="none">None</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="DNS / TLS">
          <select className="input" value={dnsMode} onChange={(e) => setDnsMode(e.target.value)}>
            <option value="none">Cloud-assigned hostname</option>
            <option value="managed">Custom domain (we manage the certificate)</option>
            <option value="existing">Custom domain (existing certificate)</option>
          </select>
        </Field>
        <Field label="Alarm email">
          <input className="input" type="email" value={alarmEmail} placeholder="ops@example.com"
                 onChange={(e) => setAlarmEmail(e.target.value)} />
        </Field>
      </div>

      {dnsMode !== "none" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Domain name">
            <input className="input" value={domainName} placeholder="api.customer.example"
                   onChange={(e) => setDomainName(e.target.value)} />
          </Field>
          {dnsMode === "managed" && provider === "baremetal" && (
            <div className="col-span-2">
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                Caddy will obtain and renew a Let&apos;s Encrypt certificate automatically. That needs
                this domain&apos;s A record to ALREADY point at the server, and ports 80 and 443 to be
                reachable from the internet — Let&apos;s Encrypt validates by connecting back. Renewal
                warnings go to the alarm email above.
              </p>
            </div>
          )}
          {dnsMode === "managed" && provider === "aws" && (
            <Field label="Route53 hosted zone ID">
              <input className="input font-mono text-xs" value={hostedZoneId} placeholder="Z04567890ABCDEFGHIJKL"
                     onChange={(e) => setHostedZoneId(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      <div className="flex gap-6 pt-1">
        <Toggle checked={multiAz} onChange={setMultiAz} label="Multi-AZ database" />
        <Toggle checked={backupEnabled} onChange={setBackupEnabled} label="Managed backup" />
      </div>

      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 mt-2">
          <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-200/90 leading-relaxed">{w}</p>
        </div>
      ))}

      <div className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] p-3 mt-3">
        <p className="text-[11px] text-[var(--muted)] leading-relaxed">
          This runs a <strong className="text-[var(--fg)]">plan only</strong> — nothing is created in the
          customer&apos;s cloud. Review the plan, then apply.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-3">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={submitting || !credentialId} onClick={submit}>
          {submitting ? "Planning…" : "Plan deployment"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Run log — polls while in flight
// ---------------------------------------------------------------

function RunPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [run, setRun] = useState<ProvisioningRun | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const stuckToBottom = useRef(true);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const r = await provisioningService.getRun(runId);
        if (!alive) return;
        setRun(r);
        // Stop polling once terminal; an apply can legitimately run for 40 minutes,
        // so there is no overall timeout here — only a terminal status ends it.
        if (r.status === "QUEUED" || r.status === "RUNNING") {
          timer = setTimeout(poll, 3000);
        }
      } catch {
        if (alive) timer = setTimeout(poll, 8000);
      }
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);

  // Follow the tail only while the operator has not scrolled up to read something.
  useEffect(() => {
    const el = logRef.current;
    if (el && stuckToBottom.current) el.scrollTop = el.scrollHeight;
  }, [run?.log]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stuckToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const live = run?.status === "RUNNING" || run?.status === "QUEUED";

  return (
    <Modal title={`${run?.action ?? "Run"} — ${run?.status ?? "loading"}`} onClose={onClose} wide>
      {run && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs mb-3">
            {typeof run.resourcesToAdd === "number" && (
              <span className="text-emerald-400">+{run.resourcesToAdd} to add</span>
            )}
            {typeof run.resourcesToChange === "number" && (
              <span className="text-amber-400">~{run.resourcesToChange} to change</span>
            )}
            {typeof run.resourcesToDestroy === "number" && (
              <span className="text-rose-400">−{run.resourcesToDestroy} to destroy</span>
            )}
            {run.startedAt && (
              <span className="text-[var(--muted)]">started {timeAgo(run.startedAt)}</span>
            )}
            {run.triggeredBy && <span className="text-[var(--muted)]">by {run.triggeredBy}</span>}
          </div>

          {run.errorMessage && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 mb-3">
              <p className="text-[11px] text-rose-200 font-mono whitespace-pre-wrap leading-relaxed">
                {run.errorMessage}
              </p>
            </div>
          )}

          <pre
            ref={logRef}
            onScroll={onScroll}
            className="h-[420px] overflow-auto rounded-md bg-black/60 p-3 text-[11px] font-mono
                       leading-relaxed text-[var(--muted)] whitespace-pre-wrap"
          >
            {run.log || (live ? "Waiting for output…" : "No output.")}
          </pre>

          <p className="text-[10px] text-[var(--muted)] mt-2">
            Every secret in the Terraform configuration is marked sensitive, so Terraform redacts it in
            its own output — this log is safe to share.
          </p>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------
// Destroy dialog
// ---------------------------------------------------------------

function DestroyDialog({ stack, org, onClose, onDestroyed }: {
  stack: InfrastructureStack;
  org?: Organization;
  onClose: () => void;
  onDestroyed: (run: ProvisioningRun) => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = org?.slug ?? "";

  const submit = async () => {
    setBusy(true);
    try {
      onDestroyed(await provisioningService.destroy(stack.id, typed));
      onClose();
    } catch {
      /* interceptor toasts the backend message */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Destroy this deployment" onClose={onClose}>
      <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 space-y-2">
        <p className="text-xs text-rose-200 leading-relaxed">
          This destroys the {TARGETS[stack.target].label} deployment for <strong>{org?.name}</strong> and
          everything in it, including the database holding the posted ledger.
        </p>
        <p className="text-[11px] text-rose-200/80 leading-relaxed">
          The stacks refuse to plan while <code className="font-mono">deletion_protection</code> is on,
          so unless it was turned off in a separate earlier change this will stop at the plan — by design.
        </p>
      </div>

      <Field label={`Type the organization slug to confirm: ${slug}`}>
        <input className="input font-mono" value={typed} autoComplete="off"
               onChange={(e) => setTyped(e.target.value)} placeholder={slug} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" disabled={busy || typed !== slug || !slug} onClick={submit}>
          {busy ? "Destroying…" : "Destroy deployment"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------

export default function ProvisioningPage() {
  const [readiness, setReadiness] = useState<ProvisioningReadiness | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [stacks, setStacks] = useState<InfrastructureStack[]>([]);
  const [credentials, setCredentials] = useState<CloudCredential[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCredential, setShowCredential] = useState(false);
  const [showProvision, setShowProvision] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [destroyTarget, setDestroyTarget] = useState<InfrastructureStack | null>(null);
  const [reachabilityTarget, setReachabilityTarget] = useState<CloudCredential | null>(null);

  const orgById = useCallback((id: string) => orgs.find((o) => o.id === id), [orgs]);

  const load = useCallback(async () => {
    try {
      const [r, o, s] = await Promise.all([
        provisioningService.readiness().catch(() => null),
        organizationService.getAll().catch(() => []),
        provisioningService.getStacks().catch(() => []),
      ]);
      setReadiness(r);
      setOrgs(o as Organization[]);
      setStacks(s);

      // Credentials are per-org, so gather them across the orgs we know about.
      const creds = await Promise.all(
        (o as Organization[]).map((org) =>
          provisioningService.getCredentials(org.id).catch(() => [] as CloudCredential[])
        )
      );
      setCredentials(creds.flat());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // While anything is in flight, refresh the list so status transitions appear
  // without the operator reloading.
  useEffect(() => {
    const busy = stacks.some((s) => ["PLANNING", "APPLYING", "DESTROYING"].includes(s.status));
    if (!busy) return;
    const t = setInterval(() => {
      provisioningService.getStacks().then(setStacks).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [stacks]);

  const openLatestRun = async (stackId: string) => {
    const runs = await provisioningService.getRuns(stackId, 0, 1);
    if (runs[0]) setActiveRunId(runs[0].id);
    else toast.error("No runs yet for this stack");
  };

  const apply = async (stack: InfrastructureStack) => {
    try {
      const run = await provisioningService.apply(stack.id);
      setActiveRunId(run.id);
      load();
    } catch { /* interceptor toasts */ }
  };

  const refresh = async (stack: InfrastructureStack) => {
    try {
      const run = await provisioningService.refresh(stack.id);
      setActiveRunId(run.id);
    } catch { /* interceptor toasts */ }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CloudCog size={20} /> Cloud Provisioning
          </h1>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
            Stand a complete ZGATE deployment up in a customer&apos;s own cloud account. Network,
            database, cache, secrets, TLS and alarms are all provisioned — all you need from the
            customer is cloud credentials.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setShowCredential(true)}>
            <KeyRound size={14} /> Add credential
          </button>
          <button
            className="btn btn-primary"
            disabled={!readiness?.available}
            onClick={() => setShowProvision(true)}
          >
            <Plus size={14} /> Provision
          </button>
        </div>
      </div>

      <ReadinessBanner readiness={readiness} />

      {/* Stacks */}
      <section className="mb-8">
        <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
          <ServerCog size={15} /> Provisioned deployments
        </h2>

        {loading ? (
          <p className="text-xs text-[var(--muted)]">Loading…</p>
        ) : stacks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
            <Cloud size={22} className="mx-auto text-[var(--muted)] mb-2" />
            <p className="text-xs text-[var(--muted)]">
              Nothing provisioned yet. Add a cloud credential, then provision a deployment.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stacks.map((s) => {
              const org = orgById(s.organizationId);
              const meta = STACK_STATUS[s.status] ?? STACK_STATUS.DRAFT;
              const busy = ["PLANNING", "APPLYING", "DESTROYING"].includes(s.status);
              return (
                <div key={s.id} className="rounded-lg border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{org?.name ?? s.organizationId}</span>
                        <span className={meta.cls}>{meta.icon}{meta.label}</span>
                        <span className="badge badge-gray">{s.environment}</span>
                        <span className="text-[11px] text-[var(--muted)]">{TARGETS[s.target]?.label ?? s.target}</span>
                      </div>

                      {s.driftDetected && s.driftSummary && (
                        <p className="text-[11px] text-amber-300/90 mt-1.5 flex items-start gap-1.5">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                          {s.driftSummary}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] text-[var(--muted)]">
                        {s.publicUrl && (
                          <a href={s.publicUrl} target="_blank" rel="noreferrer"
                             className="flex items-center gap-1 hover:text-[var(--fg)]">
                            <Globe size={11} /> {s.publicUrl}
                          </a>
                        )}
                        {s.lastAppliedAt && <span>applied {timeAgo(s.lastAppliedAt)}</span>}
                        {!s.lastAppliedAt && s.lastPlanAt && <span>planned {timeAgo(s.lastPlanAt)}</span>}
                        {s.fingerprint && (
                          <span className="font-mono" title="Deployment identity the licence binds to">
                            {s.fingerprint.slice(0, 12)}…
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button className="btn btn-ghost btn-sm" onClick={() => openLatestRun(s.id)} title="View the last run log">
                        <Terminal size={13} />
                      </button>
                      {s.status === "PLANNED" && (
                        <button className="btn btn-primary btn-sm" onClick={() => apply(s)}>
                          <Play size={13} /> Apply
                        </button>
                      )}
                      {s.status === "ACTIVE" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => refresh(s)} title="Check for drift">
                          <GitCompareArrows size={13} />
                        </button>
                      )}
                      {!busy && s.status !== "DESTROYED" && (
                        <button className="btn btn-ghost btn-sm text-rose-400" onClick={() => setDestroyTarget(s)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Credentials */}
      <section>
        <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
          <KeyRound size={15} /> Cloud credentials
        </h2>
        {credentials.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">None stored.</p>
        ) : (
          <div className="space-y-2">
            {credentials.map((c) => {
              const secretless = AUTH_MODES[c.authMode]?.secretless;
              return (
                <div key={c.id}
                     className="rounded-lg border border-[var(--border)] p-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{c.displayName}</span>
                      <span className="badge badge-gray">{c.provider}</span>
                      {secretless ? (
                        <span className="badge badge-green" title="Stores no standing secret">
                          <ShieldCheck size={10} /> assume role
                        </span>
                      ) : (
                        <span className="badge badge-yellow" title="Holds a long-lived customer secret, encrypted at rest">
                          <ShieldAlert size={10} /> stored secret
                        </span>
                      )}
                      {!c.enabled && <span className="badge badge-red">disabled</span>}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] mt-1 flex flex-wrap gap-x-4">
                      <span>{orgById(c.organizationId)?.name ?? c.organizationId}</span>
                      {c.defaultRegion && <span>{c.defaultRegion}</span>}
                      {c.sshHost && (
                        <span className="font-mono flex items-center gap-1">
                          <Server size={10} /> {c.sshUser}@{c.sshHost}:{c.sshPort ?? 22}
                        </span>
                      )}
                      {c.authMode === "SSH_KEY" && !c.sshHostPublicKey && (
                        <span className="text-amber-400/80" title="Trust-on-first-use">host key not pinned</span>
                      )}
                      {c.awsExternalId && <span className="font-mono">ext: {c.awsExternalId}</span>}
                      <span>added {formatDateTime(c.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.authMode === "SSH_KEY" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Check the server is reachable and able to run ZGATE"
                        onClick={() => setReachabilityTarget(c)}
                      >
                        <PlugZap size={13} /> Check
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm text-rose-400"
                      onClick={async () => {
                        await provisioningService.deleteCredential(c.id);
                        load();
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showCredential && (
        <CredentialDialog orgs={orgs} onClose={() => setShowCredential(false)} onSaved={load} />
      )}
      {showProvision && (
        <ProvisionDialog
          orgs={orgs}
          credentials={credentials}
          onClose={() => setShowProvision(false)}
          onStarted={(stack) => { load(); openLatestRun(stack.id); }}
        />
      )}
      {activeRunId && <RunPanel runId={activeRunId} onClose={() => { setActiveRunId(null); load(); }} />}
      {reachabilityTarget && (
        <ReachabilityPanel
          credential={reachabilityTarget}
          onClose={() => { setReachabilityTarget(null); load(); }}
        />
      )}
      {destroyTarget && (
        <DestroyDialog
          stack={destroyTarget}
          org={orgById(destroyTarget.organizationId)}
          onClose={() => setDestroyTarget(null)}
          onDestroyed={(run) => { setActiveRunId(run.id); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------

function Modal({ title, children, onClose, wide }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={cn(
        "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 max-h-[90vh] overflow-auto",
        wide ? "max-w-3xl" : "max-w-lg"
      )}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--muted)] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-black/40 px-2 py-1.5 text-[11px] font-mono break-all">
          {value || "—"}
        </code>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
        >
          <Copy size={12} />
        </button>
      </div>
    </div>
  );
}
