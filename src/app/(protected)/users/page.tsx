"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Users, Plus, Edit, Lock, Unlock, UserX, UserCheck, Shield, ShieldOff, ShieldCheck, KeyRound,
  Activity, RefreshCw, X, Search, Eye, Radio, Fingerprint, LogOut, AlertTriangle, CheckCircle2,
  ChevronLeft, ChevronRight, ChevronDown, Copy, ClipboardList, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  userService, mfaService, auditService, securityPolicyService, apiError, type SecurityPolicy,
} from "@/services/controlcenter.service";
import { timeAgo, formatDate, formatDateTime, getCurrentUser, ROLE_RANK, cn } from "@/lib/utils";
import type { ControlCenterUser, OperatorRole, AuditEntry, OperatorActivitySummary } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLES: OperatorRole[] = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"];

function roleBadge(role: OperatorRole) {
  const map: Record<OperatorRole, string> = {
    SUPER_ADMIN: "badge badge-purple",
    ADMIN: "badge badge-blue",
    SUPPORT: "badge badge-green",
    VIEWER: "badge badge-gray",
  };
  return map[role] ?? "badge badge-gray";
}

function roleLabel(role: OperatorRole) {
  const map: Record<OperatorRole, string> = {
    SUPER_ADMIN: "Super Admin", ADMIN: "Admin", SUPPORT: "Support", VIEWER: "Viewer",
  };
  return map[role] ?? role;
}

function avatarInitials(name: string) {
  return (name || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function avatarColor(id: string) {
  const colors = ["bg-controlcenter-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-pink-500"];
  return colors[(id?.charCodeAt(id.length - 1) ?? 0) % colors.length];
}

type OperatorStatus = "active" | "disabled" | "locked";

function statusOf(u: ControlCenterUser): OperatorStatus {
  if (!u.active) return "disabled";
  if (u.locked) return "locked";
  return "active";
}

/** "12m left" / "2h left" for a lockout deadline in the future. */
function untilLabel(iso: string) {
  const secs = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  if (secs < 60) return "under a minute left";
  if (secs < 3600) return `${Math.ceil(secs / 60)}m left`;
  return `${Math.ceil(secs / 3600)}h left`;
}

function StatusBadge({ u }: { u: ControlCenterUser }) {
  const s = statusOf(u);
  if (s === "disabled") return <span className="badge badge-gray"><UserX size={11} /> Disabled</span>;
  if (s === "locked") {
    return (
      <span className="badge badge-red" title={u.lockedUntil ? `Locked until ${formatDateTime(u.lockedUntil)}` : "Locked"}>
        <Lock size={11} /> Locked{u.lockedUntil ? ` · ${untilLabel(u.lockedUntil)}` : ""}
      </span>
    );
  }
  return <span className="badge badge-green"><CheckCircle2 size={11} /> Active</span>;
}

function isToday(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** Group an audit action into a colour: sign-in events, account management, MFA, SSO, other. */
function actionMeta(action: string): { badge: string; group: string } {
  if (/^(LOGIN_|STEP_UP_|ACCOUNT_LOCKED)/.test(action)) {
    const bad = /FAILED|LOCKED|REFUSED/.test(action);
    return { badge: bad ? "badge badge-red" : "badge badge-green", group: "Sign-in" };
  }
  if (/^USER_/.test(action)) return { badge: action === "USER_ACTION_REFUSED" ? "badge badge-red" : "badge badge-blue", group: "Account" };
  if (/^MFA_/.test(action)) return { badge: "badge badge-purple", group: "MFA" };
  if (/^SSO_/.test(action)) return { badge: /DENIED/.test(action) ? "badge badge-red" : "badge badge-yellow", group: "SSO" };
  return { badge: "badge badge-gray", group: "Other" };
}

function auditStatusBadge(status: AuditEntry["status"]) {
  if (status === "FAILURE") return "badge badge-red";
  if (status === "WARNING") return "badge badge-yellow";
  return "badge badge-green";
}

function humanAction(action: string) {
  return action.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** A random password that satisfies the server's policy (length, case, digit, symbol). */
function generatePassword(policy: SecurityPolicy | null) {
  const len = Math.max(policy?.passwordMinLength ?? 12, 16);
  const lower = "abcdefghjkmnpqrstuvwxyz", upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", digits = "23456789", symbols = "!@#$%^&*-_=+?";
  const pool = lower + upper + digits + (policy?.passwordRequireSymbol ? symbols : "");
  const rnd = (n: number) => {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n;
  };
  const pick = (s: string) => s[rnd(s.length)];
  const chars = [pick(lower), pick(upper), pick(digits)];
  if (policy?.passwordRequireSymbol) chars.push(pick(symbols));
  while (chars.length < len) chars.push(pick(pool));
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

function policyHint(p: SecurityPolicy | null) {
  if (!p) return "";
  const parts = [`at least ${p.passwordMinLength} characters`];
  if (p.passwordRequireMixedCase) parts.push("upper and lower case");
  if (p.passwordRequireDigit) parts.push("a digit");
  if (p.passwordRequireSymbol) parts.push("a symbol");
  return parts.join(", ");
}

// ─── Role permissions matrix (mirrors @PreAuthorize on the backend) ───────────

const PERMISSIONS: { capability: string; roles: Record<OperatorRole, boolean>; note?: string }[] = [
  { capability: "View operators", roles: { SUPER_ADMIN: true, ADMIN: true, SUPPORT: false, VIEWER: false } },
  { capability: "Create operators / edit name & role", roles: { SUPER_ADMIN: true, ADMIN: true, SUPPORT: false, VIEWER: false }, note: "An Admin can never grant Super Admin or edit a Super Admin account." },
  { capability: "Clear a sign-in lockout", roles: { SUPER_ADMIN: true, ADMIN: true, SUPPORT: false, VIEWER: false } },
  { capability: "Disable / enable an operator", roles: { SUPER_ADMIN: true, ADMIN: false, SUPPORT: false, VIEWER: false }, note: "Nobody can disable themselves or the last active Super Admin." },
  { capability: "Reset another operator's password", roles: { SUPER_ADMIN: true, ADMIN: false, SUPPORT: false, VIEWER: false }, note: "Requires step-up re-authentication; revokes the target's sessions." },
  { capability: "Revoke sessions / reset MFA (break-glass)", roles: { SUPER_ADMIN: true, ADMIN: false, SUPPORT: false, VIEWER: false } },
  { capability: "Activity monitor & audit trail", roles: { SUPER_ADMIN: true, ADMIN: true, SUPPORT: true, VIEWER: false } },
  { capability: "Enrol own two-factor authentication", roles: { SUPER_ADMIN: true, ADMIN: true, SUPPORT: true, VIEWER: true } },
];

// ─── Small building blocks ────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className={cn("bg-white rounded-2xl shadow-2xl w-full p-6 mx-4", wide ? "max-w-2xl" : "max-w-md")}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel, danger, busy, onConfirm, onClose }: {
  title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; busy: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm text-slate-600 space-y-2">{body}</div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function SkeletonRows({ n = 5, cols = 7 }: { n?: number; cols?: number }) {
  return (
    <>
      {[...Array(n)].map((_, i) => (
        <tr key={i}>
          {[...Array(cols)].map((__, j) => (
            <td key={j}><div className="h-4 animate-pulse bg-slate-100 rounded" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Is the failure a step-up prompt? The interceptor already opened the re-auth dialog. */
function isStepUp(e: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (e as any)?.response?.status === 403 && (e as any)?.response?.data?.code === "STEP_UP_REQUIRED";
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function AddUserDialog({ policy, canGrantSuper, onClose, onCreated }: {
  policy: SecurityPolicy | null; canGrantSuper: boolean; onClose: () => void; onCreated: (u: ControlCenterUser) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "VIEWER" as OperatorRole });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await userService.create(form);
      onCreated(created);
      onClose();
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  }

  return (
    <Modal title="Add operator" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="add-name">Full name</label>
          <input id="add-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="add-email">Email</label>
          <input id="add-email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="add-password">Initial password</label>
          <div className="flex gap-2">
            <input id="add-password" className="input font-mono" type={show ? "text" : "password"} required value={form.password}
                   onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="btn-secondary px-3" title="Generate" onClick={() => { setForm({ ...form, password: generatePassword(policy) }); setShow(true); }}><Wand2 size={14} /></button>
            <button type="button" className="btn-secondary px-3" title={show ? "Hide" : "Show"} onClick={() => setShow(!show)}><Eye size={14} /></button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Policy: {policyHint(policy) || "loading…"}. Share it out of band; they should change it after first sign-in.</p>
        </div>
        <div>
          <label className="label" htmlFor="add-role">Role</label>
          <select id="add-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as OperatorRole })}>
            {ROLES.filter((r) => canGrantSuper || r !== "SUPER_ADMIN").map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create operator"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserDialog({ user, canGrantSuper, isSelf, onClose, onSaved }: {
  user: ControlCenterUser; canGrantSuper: boolean; isSelf: boolean; onClose: () => void; onSaved: (u: ControlCenterUser) => void;
}) {
  const [form, setForm] = useState({ name: user.name, role: user.role });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await userService.update(user.id, { name: form.name, email: user.email, role: form.role });
      onSaved(saved);
      onClose();
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  }

  return (
    <Modal title="Edit operator" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="edit-name">Full name</label>
          <input id="edit-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="edit-email">Email</label>
          <input id="edit-email" className="input bg-slate-50 text-slate-500" value={user.email} disabled />
          <p className="text-xs text-slate-400 mt-1">The email is the sign-in identity and cannot be changed.</p>
        </div>
        <div>
          <label className="label" htmlFor="edit-role">Role</label>
          <select id="edit-role" className="select" value={form.role} disabled={isSelf}
                  onChange={(e) => setForm({ ...form, role: e.target.value as OperatorRole })}>
            {ROLES.filter((r) => canGrantSuper || r !== "SUPER_ADMIN" || r === user.role).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          {isSelf && <p className="text-xs text-slate-400 mt-1">You cannot change your own role.</p>}
          {!isSelf && form.role !== user.role && <p className="text-xs text-amber-600 mt-1">Changing the role signs the operator out of every session.</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ user, policy, onClose, onDone }: {
  user: ControlCenterUser; policy: SecurityPolicy | null; onClose: () => void; onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsStepUp, setNeedsStepUp] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await userService.resetPassword(user.id, password);
      onDone();
      onClose();
    } catch (err) {
      if (isStepUp(err)) setNeedsStepUp(true); else toast.error(apiError(err));
    }
    setBusy(false);
  }

  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Sets a new password for <span className="font-medium">{user.email}</span>, signs them out of every session
          and clears any lockout. Share the new password out of band.
        </p>
        <div>
          <label className="label" htmlFor="reset-password">New password</label>
          <div className="flex gap-2">
            <input id="reset-password" className="input font-mono" type={show ? "text" : "password"} required value={password}
                   onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <button type="button" className="btn-secondary px-3" title="Generate" onClick={() => { setPassword(generatePassword(policy)); setShow(true); }}><Wand2 size={14} /></button>
            <button type="button" className="btn-secondary px-3" title="Copy"
                    onClick={async () => { try { await navigator.clipboard.writeText(password); toast.success("Copied"); } catch { toast.error("Clipboard unavailable"); } }}><Copy size={14} /></button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Policy: {policyHint(policy) || "loading…"}.</p>
        </div>
        {needsStepUp && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>This action needs a fresh re-authentication. Confirm your identity in the prompt, then click Reset again.</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-danger" disabled={busy || !password}>{busy ? "Resetting…" : "Reset password"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeMyPasswordDialog({ policy, onClose }: { policy: SecurityPolicy | null; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { toast.error("The new passwords do not match."); return; }
    setBusy(true);
    try {
      await userService.changeMyPassword(current, next, mfaCode || undefined);
      toast.success("Password changed. Sign in again with the new one.");
      // Every session was revoked server-side, this one included — go to the sign-in page cleanly.
      localStorage.removeItem("controlcenter_token");
      document.cookie = "controlcenter_token=; path=/; max-age=0";
      window.location.href = "/login";
      return;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (err as any)?.response?.data?.code;
      if (code === "MFA_REQUIRED") { setNeedsMfa(true); toast.info("Enter the code from your authenticator app"); }
      else toast.error(apiError(err));
    }
    setBusy(false);
  }

  return (
    <Modal title="Change my password" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" className="input" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </div>
        {needsMfa && (
          <div>
            <label className="label" htmlFor="pw-mfa">Authenticator code</label>
            <input id="pw-mfa" className="input font-mono tracking-[0.3em]" inputMode="numeric" placeholder="123456" value={mfaCode}
                   onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="pw-new">New password</label>
          <div className="flex gap-2">
            <input id="pw-new" className="input font-mono" type={show ? "text" : "password"} required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <button type="button" className="btn-secondary px-3" title="Generate" onClick={() => { const p = generatePassword(policy); setNext(p); setConfirm(p); setShow(true); }}><Wand2 size={14} /></button>
            <button type="button" className="btn-secondary px-3" title={show ? "Hide" : "Show"} onClick={() => setShow(!show)}><Eye size={14} /></button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Policy: {policyHint(policy) || "loading…"}.</p>
        </div>
        <div>
          <label className="label" htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" className="input font-mono" type={show ? "text" : "password"} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <p className="text-xs text-amber-600">You will be signed out everywhere and asked to sign in again.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !current || !next}>{busy ? "Changing…" : "Change password"}</button>
        </div>
      </form>
    </Modal>
  );
}

function MfaEnrollDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"start" | "verify">("start");
  const [currentCode, setCurrentCode] = useState("");
  const [needsCurrent, setNeedsCurrent] = useState(false);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const r = await mfaService.enroll(currentCode || undefined);
      setSecret(r.secret); setUri(r.otpauthUri); setStep("verify");
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.response?.data?.code === "MFA_REQUIRED") setNeedsCurrent(true);
      else toast.error(apiError(err));
    }
    setBusy(false);
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await mfaService.activate(code); onDone(); onClose(); }
    catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  }

  return (
    <Modal title="Secure my sign-in (two-factor)" onClose={onClose}>
      {step === "start" ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Adds a time-based code from an authenticator app to your sign-in. A new secret is issued now; it only takes effect once you confirm a code from the app.</p>
          {needsCurrent && (
            <div>
              <label className="label" htmlFor="mfa-current">Current code (MFA is already on)</label>
              <input id="mfa-current" className="input font-mono" value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} placeholder="123456" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={start} disabled={busy}>{busy ? "…" : "Start enrolment"}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={activate} className="space-y-4 text-sm text-slate-600">
          <p>Add this secret to your authenticator app, then enter the code it shows.</p>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs break-all">{secret}</div>
          <details className="text-xs"><summary className="cursor-pointer text-slate-500">otpauth URI</summary><div className="font-mono break-all mt-1">{uri}</div></details>
          <div>
            <label className="label" htmlFor="mfa-code">Code from the app</label>
            <input id="mfa-code" className="input font-mono" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? "…" : "Activate"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─── Activity feed table (shared by the monitor tab and the operator drawer) ──

function ActivityRows({ rows, usersById, onActor, compact }: {
  rows: AuditEntry[]; usersById: Map<string, ControlCenterUser>; onActor?: (email: string) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const targetLabel = (e: AuditEntry) => {
    if (!e.entityId) return e.entityType || "—";
    const u = usersById.get(e.entityId);
    if (u) return u.name;
    return e.entityType === "ControlCenterUser" ? e.entityId : `${e.entityType ?? ""} ${e.entityId.slice(0, 8)}…`;
  };
  return (
    <>
      {rows.map((e) => {
        const meta = actionMeta(e.action);
        const expanded = open === e.id;
        return (
          <RowGroup key={e.id}>
            <tr className="cursor-pointer" onClick={() => setOpen(expanded ? null : e.id)}>
              <td className="whitespace-nowrap text-xs text-slate-500" title={e.timestamp ? formatDateTime(e.timestamp) : ""}>
                {e.timestamp ? timeAgo(e.timestamp) : "—"}
              </td>
              {!compact && (
                <td className="text-xs">
                  {onActor ? (
                    <button className="text-controlcenter-700 hover:underline" onClick={(ev) => { ev.stopPropagation(); onActor(e.actorEmail || e.actor); }}>
                      {e.actorEmail || e.actor || "system"}
                    </button>
                  ) : (e.actorEmail || e.actor || "system")}
                </td>
              )}
              <td><span className={meta.badge} title={e.action}>{humanAction(e.action)}</span></td>
              {!compact && <td className="text-xs text-slate-600 max-w-[16rem] truncate" title={e.entityId ?? ""}>{targetLabel(e)}</td>}
              <td><span className={auditStatusBadge(e.status)}>{e.status}</span></td>
              {!compact && <td className="text-xs font-mono text-slate-500">{e.ipAddress || "—"}</td>}
              <td className="text-xs text-slate-500 max-w-[18rem] truncate" title={e.details ?? ""}>{e.details || "—"}</td>
            </tr>
            {expanded && (
              <tr className="bg-slate-50">
                <td colSpan={compact ? 4 : 7} className="text-xs text-slate-600">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><div className="text-slate-400">When</div>{e.timestamp ? formatDateTime(e.timestamp) : "—"}</div>
                    <div><div className="text-slate-400">Actor</div>{e.actorEmail || e.actor || "—"}</div>
                    <div><div className="text-slate-400">Target</div>{e.entityType || "—"}{e.entityId ? ` · ${e.entityId}` : ""}</div>
                    <div><div className="text-slate-400">IP</div>{e.ipAddress || "—"}</div>
                    <div className="col-span-2 md:col-span-4"><div className="text-slate-400">Details</div><span className="font-mono break-all">{e.details || "—"}</span></div>
                    <div className="col-span-2 md:col-span-4 text-slate-400">Event {e.id}</div>
                  </div>
                </td>
              </tr>
            )}
          </RowGroup>
        );
      })}
    </>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) { return <>{children}</>; }

// ─── Operator drawer ──────────────────────────────────────────────────────────

function OperatorDrawer({ user, me, isSuper, isAdmin, usersById, onClose, onAction }: {
  user: ControlCenterUser; me: { email: string }; isSuper: boolean; isAdmin: boolean;
  usersById: Map<string, ControlCenterUser>; onClose: () => void;
  onAction: (kind: "edit" | "reset" | "unlock" | "disable" | "enable" | "revoke" | "mfa", u: ControlCenterUser) => void;
}) {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const isSelf = user.email.toLowerCase() === me.email.toLowerCase();
  const canManage = isSuper || (isAdmin && user.role !== "SUPER_ADMIN");

  const load = useCallback(async (p: number, append: boolean) => {
    setLoading(true);
    try {
      const r = await userService.activity(user.id, p, 20);
      setRows((prev) => (append ? [...prev, ...r.content] : r.content));
      setTotal(r.totalElements);
      setPage(p);
    } catch (e) { toast.error(apiError(e)); }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(0, false); }, [load]);

  const Action = ({ icon: Icon, label, onClick, danger, show = true }: { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean; show?: boolean }) =>
    show ? (
      <button className={cn("text-xs", danger ? "btn-danger" : "btn-secondary")} onClick={onClick}><Icon size={13} /> {label}</button>
    ) : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-full text-white flex items-center justify-center text-sm font-semibold", avatarColor(user.id))}>{avatarInitials(user.name)}</div>
            <div>
              <div className="font-semibold text-slate-900 flex items-center gap-2">{user.name}{isSelf && <span className="badge badge-gray">you</span>}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Role"><span className={roleBadge(user.role)}>{roleLabel(user.role)}</span></Field>
            <Field label="Status"><StatusBadge u={user} /></Field>
            <Field label="Two-factor">{user.mfaEnabled ? <span className="badge badge-green"><ShieldCheck size={11} /> Enabled</span> : <span className="badge badge-gray"><ShieldOff size={11} /> Off</span>}</Field>
            <Field label="Sign-in method">{user.ssoLinked ? <span className="badge badge-blue"><Fingerprint size={11} /> SSO linked</span> : <span className="badge badge-gray">Password</span>}</Field>
            <Field label="Failed attempts">{user.failedLoginAttempts}{user.lockedUntil ? <span className="text-xs text-red-600"> · locked until {formatDateTime(user.lockedUntil)}</span> : ""}</Field>
            <Field label="Last sign-in">{user.lastLogin ? `${timeAgo(user.lastLogin)} (${formatDateTime(user.lastLogin)})` : "Never"}</Field>
            <Field label="Created">{formatDate(user.createdAt)}</Field>
            <Field label="Account id"><span className="font-mono text-xs">{user.id}</span></Field>
          </div>

          {canManage && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                <Action icon={Edit} label="Edit" onClick={() => onAction("edit", user)} />
                <Action icon={Unlock} label="Clear lockout" onClick={() => onAction("unlock", user)} show={user.locked || user.failedLoginAttempts > 0} />
                <Action icon={KeyRound} label="Reset password" onClick={() => onAction("reset", user)} show={isSuper} />
                <Action icon={LogOut} label="Revoke sessions" onClick={() => onAction("revoke", user)} show={isSuper} />
                <Action icon={ShieldOff} label="Reset MFA" onClick={() => onAction("mfa", user)} show={isSuper && user.mfaEnabled} />
                {user.active
                  ? <Action icon={UserX} label="Disable" danger onClick={() => onAction("disable", user)} show={isSuper && !isSelf} />
                  : <Action icon={UserCheck} label="Enable" onClick={() => onAction("enable", user)} show={isSuper} />}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Activity</div>
              <div className="text-xs text-slate-400">{total} event{total === 1 ? "" : "s"}</div>
            </div>
            <div className="table-container">
              <table>
                <thead><tr><th>When</th><th>Action</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {loading && rows.length === 0 ? <SkeletonRows n={4} cols={4} /> :
                    rows.length === 0 ? <tr><td colSpan={4} className="text-center text-slate-400 py-8">No recorded activity yet.</td></tr> :
                    <ActivityRows rows={rows} usersById={usersById} compact />}
                </tbody>
              </table>
            </div>
            {rows.length < total && (
              <button className="btn-secondary text-xs mt-2" onClick={() => load(page + 1, true)} disabled={loading}>
                {loading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "operators" | "activity" | "permissions";
type Pending =
  | { kind: "disable" | "enable" | "revoke" | "unlock" | "mfa"; user: ControlCenterUser }
  | null;

export default function AdminManagementPage() {
  // Read the token after mount, not during render: the page is prerendered without a browser, so
  // reading localStorage while rendering would make the first client render disagree with the HTML.
  const [me, setMe] = useState<ReturnType<typeof getCurrentUser>>({ email: "", role: "" });
  useEffect(() => { setMe(getCurrentUser()); }, []);
  const isSuper = me.role === "SUPER_ADMIN";
  const isAdmin = (ROLE_RANK[me.role] ?? 0) >= ROLE_RANK.ADMIN;

  const [tab, setTab] = useState<Tab>("operators");
  const [users, setUsers] = useState<ControlCenterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);

  // Operators tab filters
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | OperatorRole>("");
  const [statusFilter, setStatusFilter] = useState<"" | OperatorStatus | "no-mfa">("");

  // Dialog / drawer state
  const [showAdd, setShowAdd] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [editing, setEditing] = useState<ControlCenterUser | null>(null);
  const [resetting, setResetting] = useState<ControlCenterUser | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<ControlCenterUser | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const usersByEmail = useMemo(() => new Map(users.map((u) => [u.email.toLowerCase(), u])), [users]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await userService.getAll();
      setUsers(list);
      setDrawer((d) => (d ? list.find((u) => u.id === d.id) ?? null : d));
    } catch (e) { setError(apiError(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { securityPolicyService.get().then(setPolicy).catch(() => setPolicy(null)); }, []);

  function patch(u: ControlCenterUser) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
    setDrawer((d) => (d && d.id === u.id ? { ...d, ...u } : d));
  }

  async function runPending() {
    if (!pending) return;
    const { kind, user } = pending;
    setBusy(true);
    try {
      if (kind === "disable") { await userService.disable(user.id); patch({ ...user, active: false }); }
      if (kind === "enable") { await userService.enable(user.id); patch({ ...user, active: true }); }
      if (kind === "revoke") { await userService.revokeSessions(user.id); patch({ ...user, lastLogin: null }); }
      if (kind === "unlock") { await userService.unlock(user.id); patch({ ...user, locked: false, lockedUntil: null, failedLoginAttempts: 0 }); }
      if (kind === "mfa") { await mfaService.disable(user.id); patch({ ...user, mfaEnabled: false }); }
      setPending(null);
      setDrawerKey((k) => k + 1);
    } catch (e) {
      if (isStepUp(e)) toast.message("Confirm your identity in the prompt, then confirm again.");
      else toast.error(apiError(e));
    }
    setBusy(false);
  }

  const openAction: Parameters<typeof OperatorDrawer>[0]["onAction"] = (kind, u) => {
    if (kind === "edit") setEditing(u);
    else if (kind === "reset") setResetting(u);
    else setPending({ kind, user: u });
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
      .filter((u) => !roleFilter || u.role === roleFilter)
      .filter((u) => {
        if (!statusFilter) return true;
        if (statusFilter === "no-mfa") return !u.mfaEnabled && u.active;
        return statusOf(u) === statusFilter;
      })
      .sort((a, b) => (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0) || a.name.localeCompare(b.name));
  }, [users, q, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => statusOf(u) === "active").length,
    locked: users.filter((u) => u.locked).length,
    disabled: users.filter((u) => !u.active).length,
    mfa: users.filter((u) => u.mfaEnabled).length,
    today: users.filter((u) => isToday(u.lastLogin)).length,
  }), [users]);

  const pendingCopy: Record<NonNullable<Pending>["kind"], { title: string; body: (u: ControlCenterUser) => React.ReactNode; label: string; danger?: boolean }> = {
    disable: { title: "Disable operator", label: "Disable", danger: true,
      body: (u) => <><p><span className="font-medium">{u.name}</span> will be signed out of every session and refused at sign-in until re-enabled.</p></> },
    enable: { title: "Enable operator", label: "Enable",
      body: (u) => <p><span className="font-medium">{u.name}</span> will be able to sign in again with their existing password.</p> },
    revoke: { title: "Revoke sessions", label: "Revoke", danger: true,
      body: (u) => <p>Every active session of <span className="font-medium">{u.name}</span> is invalidated immediately. Their password is unchanged.</p> },
    unlock: { title: "Clear sign-in lockout", label: "Clear lockout",
      body: (u) => <p>Resets the failed-attempt counter for <span className="font-medium">{u.name}</span> so they can try again now. Only do this once you have identified them out of band.</p> },
    mfa: { title: "Reset two-factor (break-glass)", label: "Reset MFA", danger: true,
      body: (u) => <p>Removes the authenticator from <span className="font-medium">{u.name}</span> and revokes their sessions. They sign in with password only until they enrol again. Requires step-up.</p> },
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Users size={22} className="text-controlcenter-600" /> Admin Management</h1>
          <p className="text-sm text-slate-500 mt-1">Control Center operators, their access, and what they do.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button className="btn-secondary" onClick={() => setShowChangePw(true)}><KeyRound size={14} /> Change my password</button>
          <button className="btn-secondary" onClick={() => setShowEnroll(true)}><Shield size={14} /> Secure my sign-in</button>
          {isAdmin && <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} /> Add operator</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([
          ["operators", "Operators", Users],
          ["activity", "Activity monitor", Activity],
          ["permissions", "Permissions", ClipboardList],
        ] as [Tab, string, React.ElementType][]).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
                  className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                    tab === key ? "border-controlcenter-600 text-controlcenter-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {tab === "operators" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <div className="stat-card"><div className="stat-value">{stats.total}</div><div className="stat-label">Operators</div></div>
            <div className="stat-card"><div className="stat-value text-emerald-600">{stats.active}</div><div className="stat-label">Active</div></div>
            <div className="stat-card"><div className={cn("stat-value", stats.locked && "text-red-600")}>{stats.locked}</div><div className="stat-label">Locked out</div></div>
            <div className="stat-card"><div className="stat-value text-slate-500">{stats.disabled}</div><div className="stat-label">Disabled</div></div>
            <div className="stat-card"><div className="stat-value">{stats.mfa}<span className="text-sm font-normal text-slate-400"> / {stats.total}</span></div><div className="stat-label">Two-factor on</div></div>
            <div className="stat-card"><div className="stat-value">{stats.today}</div><div className="stat-label">Signed in today</div></div>
          </div>

          <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[14rem]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="select w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | OperatorRole)}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <select className="select w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="locked">Locked out</option>
              <option value="disabled">Disabled</option>
              <option value="no-mfa">Without two-factor</option>
            </select>
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {users.length}</span>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Operator</th><th>Role</th><th>Security</th><th>Status</th><th>Last sign-in</th><th>Created</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <SkeletonRows /> : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-slate-400 py-12">No operators match.</td></tr>
                ) : filtered.map((u) => {
                  const isSelf = u.email.toLowerCase() === me.email.toLowerCase();
                  const canManage = isSuper || (isAdmin && u.role !== "SUPER_ADMIN");
                  return (
                    <tr key={u.id} className="cursor-pointer" onClick={() => setDrawer(u)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className={cn("w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-semibold shrink-0", avatarColor(u.id))}>{avatarInitials(u.name)}</div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 flex items-center gap-2">{u.name}{isSelf && <span className="badge badge-gray">you</span>}</div>
                            <div className="text-xs text-slate-500 truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={roleBadge(u.role)}>{roleLabel(u.role)}</span></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {u.mfaEnabled ? <span className="badge badge-green"><ShieldCheck size={11} /> MFA</span> : <span className="badge badge-gray"><ShieldOff size={11} /> No MFA</span>}
                          {u.ssoLinked && <span className="badge badge-blue"><Fingerprint size={11} /> SSO</span>}
                        </div>
                      </td>
                      <td><StatusBadge u={u} /></td>
                      <td className="text-xs text-slate-500 whitespace-nowrap" title={u.lastLogin ? formatDateTime(u.lastLogin) : ""}>{u.lastLogin ? timeAgo(u.lastLogin) : "Never"}</td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="View activity" onClick={() => setDrawer(u)}><Eye size={15} /></button>
                          {canManage && <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Edit" onClick={() => setEditing(u)}><Edit size={15} /></button>}
                          {canManage && u.locked && <button className="p-1.5 rounded hover:bg-amber-50 text-amber-600" title="Clear lockout" onClick={() => setPending({ kind: "unlock", user: u })}><Unlock size={15} /></button>}
                          {isSuper && <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Reset password" onClick={() => setResetting(u)}><KeyRound size={15} /></button>}
                          {isSuper && !isSelf && (u.active
                            ? <button className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Disable" onClick={() => setPending({ kind: "disable", user: u })}><UserX size={15} /></button>
                            : <button className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600" title="Enable" onClick={() => setPending({ kind: "enable", user: u })}><UserCheck size={15} /></button>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "activity" && (
        <ActivityMonitor users={users} usersById={usersById} onOpenOperator={(email) => {
          const u = usersByEmail.get(email.toLowerCase());
          if (u) setDrawer(u); else toast.message(`${email} is not an operator account (or was removed).`);
        }} />
      )}

      {tab === "permissions" && (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Capability</th>{ROLES.map((r) => <th key={r} className="text-center">{roleLabel(r)}</th>)}</tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.capability}>
                  <td>
                    <div className="font-medium text-slate-800">{p.capability}</div>
                    {p.note && <div className="text-xs text-slate-400 mt-0.5">{p.note}</div>}
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className="text-center">
                      {p.roles[r] ? <CheckCircle2 size={16} className="inline text-emerald-500" /> : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
            Enforced by the server on every request; this table mirrors those rules. Your role: <span className={roleBadge((me.role || "VIEWER") as OperatorRole)}>{roleLabel((me.role || "VIEWER") as OperatorRole)}</span>
          </div>
        </div>
      )}

      {/* Dialogs & drawer */}
      {showAdd && <AddUserDialog policy={policy} canGrantSuper={isSuper} onClose={() => setShowAdd(false)} onCreated={(u) => setUsers((prev) => [u, ...prev])} />}
      {showEnroll && <MfaEnrollDialog onClose={() => setShowEnroll(false)} onDone={load} />}
      {showChangePw && <ChangeMyPasswordDialog policy={policy} onClose={() => setShowChangePw(false)} />}
      {editing && (
        <EditUserDialog user={editing} canGrantSuper={isSuper} isSelf={editing.email.toLowerCase() === me.email.toLowerCase()}
                        onClose={() => setEditing(null)} onSaved={(u) => { patch(u); setDrawerKey((k) => k + 1); }} />
      )}
      {resetting && (
        <ResetPasswordDialog user={resetting} policy={policy} onClose={() => setResetting(null)}
                             onDone={() => { patch({ ...resetting, locked: false, lockedUntil: null, failedLoginAttempts: 0 }); setDrawerKey((k) => k + 1); }} />
      )}
      {pending && (
        <ConfirmDialog title={pendingCopy[pending.kind].title} body={pendingCopy[pending.kind].body(pending.user)}
                       confirmLabel={pendingCopy[pending.kind].label} danger={pendingCopy[pending.kind].danger}
                       busy={busy} onConfirm={runPending} onClose={() => setPending(null)} />
      )}
      {drawer && (
        <OperatorDrawer key={`${drawer.id}-${drawerKey}`} user={drawer} me={me} isSuper={isSuper} isAdmin={isAdmin}
                        usersById={usersById} onClose={() => setDrawer(null)} onAction={openAction} />
      )}
    </div>
  );
}

// ─── Activity monitor tab ─────────────────────────────────────────────────────

const WINDOWS: { hours: number; label: string }[] = [
  { hours: 1, label: "Last hour" }, { hours: 24, label: "Last 24 hours" }, { hours: 24 * 7, label: "Last 7 days" }, { hours: 24 * 30, label: "Last 30 days" },
];
const PAGE_SIZE = 25;

function ActivityMonitor({ users, usersById, onOpenOperator }: {
  users: ControlCenterUser[]; usersById: Map<string, ControlCenterUser>; onOpenOperator: (email: string) => void;
}) {
  const [summary, setSummary] = useState<OperatorActivitySummary | null>(null);
  const [hours, setHours] = useState(24);
  const [scope, setScope] = useState<"identity" | "all">("identity");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [status, setStatus] = useState<"" | "SUCCESS" | "FAILURE" | "WARNING">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const toIso = (local: string) => (local ? new Date(local).toISOString().slice(0, 19) : undefined);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, p] = await Promise.all([
        userService.activitySummary(hours),
        auditService.searchPaged({
          entityType: scope === "identity" ? "ControlCenterUser" : undefined,
          actor: actor || undefined,
          action: action.trim() || undefined,
          status: status || undefined,
          from: toIso(from), to: toIso(to),
          page, size: PAGE_SIZE,
        }),
      ]);
      setSummary(s); setRows(p.content); setTotal(p.totalElements); setLastRefresh(new Date());
    } catch (e) { if (!silent) toast.error(apiError(e)); }
    setLoading(false);
  }, [hours, scope, actor, action, status, from, to, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (live) timer.current = setInterval(() => load(true), 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [live, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(0); };

  const Stat = ({ value, label, tone }: { value: number | undefined; label: string; tone?: string }) => (
    <div className="stat-card">
      <div className={cn("stat-value", tone)}>{value ?? "—"}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <select className="select w-auto" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {WINDOWS.map((w) => <option key={w.hours} value={w.hours}>{w.label}</option>)}
          </select>
          <span className="text-xs text-slate-400">Summary window</span>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && <span className="text-xs text-slate-400">Updated {timeAgo(lastRefresh)}</span>}
          <button className={cn("btn-secondary", live && "border-emerald-300 text-emerald-700 bg-emerald-50")} onClick={() => setLive(!live)}>
            <Radio size={14} className={live ? "animate-pulse" : ""} /> {live ? "Live · 5s" : "Live"}
          </button>
          <button className="btn-secondary" onClick={() => load()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Stat value={summary?.signIns} label="Sign-ins" tone="text-emerald-600" />
        <Stat value={summary?.failedSignIns} label="Failed sign-ins" tone={summary?.failedSignIns ? "text-red-600" : undefined} />
        <Stat value={summary?.lockouts} label="Lockouts" tone={summary?.lockouts ? "text-red-600" : undefined} />
        <Stat value={summary?.adminActions} label="Admin actions" tone="text-blue-600" />
        <Stat value={summary?.activeOperators} label="Active operators" />
        <Stat value={summary?.failures} label="Failed actions (all)" tone={summary?.failures ? "text-amber-600" : undefined} />
      </div>

      <div className="card p-3 mb-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <select className="select" value={scope} onChange={(e) => resetPage(setScope)(e.target.value as "identity" | "all")}>
          <option value="identity">Identity & security events</option>
          <option value="all">All operator activity</option>
        </select>
        <select className="select" value={actor} onChange={(e) => resetPage(setActor)(e.target.value)}>
          <option value="">Any operator</option>
          {users.map((u) => <option key={u.id} value={u.email}>{u.name} — {u.email}</option>)}
        </select>
        <input className="input" placeholder="Action contains… e.g. LOGIN" value={action} onChange={(e) => resetPage(setAction)(e.target.value)} />
        <select className="select" value={status} onChange={(e) => resetPage(setStatus)(e.target.value as typeof status)}>
          <option value="">Any outcome</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILURE">Failure</option>
          <option value="WARNING">Warning</option>
        </select>
        <input className="input" type="datetime-local" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} title="From" />
        <input className="input" type="datetime-local" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} title="To" />
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>When</th><th>Operator</th><th>Action</th><th>Target</th><th>Outcome</th><th>IP</th><th>Details</th></tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? <SkeletonRows n={8} cols={7} /> : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-slate-400 py-12">No events match these filters.</td></tr>
            ) : <ActivityRows rows={rows} usersById={usersById} onActor={onOpenOperator} />}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
          <span>{total} event{total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2 py-1" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
            <span>Page {page + 1} of {totalPages}</span>
            <button className="btn-secondary px-2 py-1" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3 flex items-center gap-1"><ChevronDown size={12} /> Click a row for the full event; click an operator to open their account.</p>
    </>
  );
}
