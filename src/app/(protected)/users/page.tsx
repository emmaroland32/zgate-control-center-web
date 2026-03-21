/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Edit, Lock, UserX, Shield, Eye, Mail, Clock,
  RefreshCw, AlertTriangle, CheckCircle2, X,
} from "lucide-react";
import { userService } from "@/services/nexus.service";
import { timeAgo, formatDate } from "@/lib/utils";
import type { NexusUser } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleBadge(role: NexusUser["role"]) {
  const map: Record<NexusUser["role"], string> = {
    SUPER_ADMIN: "badge badge-purple",
    ADMIN: "badge badge-blue",
    SUPPORT: "badge badge-green",
    VIEWER: "badge badge-gray",
  };
  return map[role];
}

function roleLabel(role: NexusUser["role"]) {
  const map: Record<NexusUser["role"], string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    SUPPORT: "Support",
    VIEWER: "Viewer",
  };
  return map[role];
}

function avatarInitials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function avatarColor(id: string) {
  const colors = [
    "bg-nexus-500", "bg-blue-500", "bg-emerald-500",
    "bg-amber-500", "bg-purple-500", "bg-pink-500",
  ];
  const idx = id.charCodeAt(id.length - 1) % colors.length;
  return colors[idx];
}

function isLoginToday(lastLogin?: string) {
  if (!lastLogin) return false;
  const d = new Date(lastLogin);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

// ─── Role permissions matrix ──────────────────────────────────────────────────

const PERMISSIONS = [
  { label: "View dashboard", SUPER_ADMIN: true, ADMIN: true, SUPPORT: true, VIEWER: true },
  { label: "Manage organizations", SUPER_ADMIN: true, ADMIN: true, SUPPORT: false, VIEWER: false },
  { label: "Issue licenses", SUPER_ADMIN: true, ADMIN: true, SUPPORT: false, VIEWER: false },
  { label: "Push releases", SUPER_ADMIN: true, ADMIN: true, SUPPORT: false, VIEWER: false },
  { label: "Trigger deployments", SUPER_ADMIN: true, ADMIN: true, SUPPORT: false, VIEWER: false },
  { label: "View audit trail", SUPER_ADMIN: true, ADMIN: true, SUPPORT: true, VIEWER: false },
  { label: "Manage integrations", SUPER_ADMIN: true, ADMIN: false, SUPPORT: false, VIEWER: false },
  { label: "Manage users", SUPER_ADMIN: true, ADMIN: false, SUPPORT: false, VIEWER: false },
  { label: "Edit system settings", SUPER_ADMIN: true, ADMIN: false, SUPPORT: false, VIEWER: false },
  { label: "View health & metrics", SUPER_ADMIN: true, ADMIN: true, SUPPORT: true, VIEWER: true },
];

const ROLES: NexusUser["role"][] = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-slate-200 rounded animate-pulse w-full" />
        </td>
      ))}
    </tr>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────

interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (user: NexusUser) => void;
}

function AddUserDialog({ open, onClose, onCreated }: AddUserDialogProps) {
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "VIEWER" as NexusUser["role"],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm({ name: "", email: "", password: "", role: "VIEWER" });
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await userService.create({
        name: form.name, email: form.email, role: form.role, password: form.password,
        createdAt: new Date().toISOString(), active: true,
      });
      onCreated(created);
      handleClose();
    } catch {
      setError("Failed to create user. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users size={16} className="text-nexus-500" />
            Add User
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input
              className="input"
              placeholder="e.g. Jane Smith"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email Address</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8"
                type="email"
                placeholder="user@zgate.io"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8"
                type="password"
                placeholder="Minimum 8 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as NexusUser["role"] })}
            >
              <option value="VIEWER">Viewer</option>
              <option value="SUPPORT">Support</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────────────────────

interface EditUserDialogProps {
  user: NexusUser | null;
  onClose: () => void;
  onSaved: (user: NexusUser) => void;
}

function EditUserDialog({ user, onClose, onSaved }: EditUserDialogProps) {
  const [form, setForm] = useState({ name: user?.name ?? "", role: user?.role ?? "VIEWER" as NexusUser["role"] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm({ name: user.name, role: user.role });
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const updated = await userService.update(user.id, { name: form.name, role: form.role });
      onSaved(updated);
    } catch {
      onSaved({ ...user, name: form.name, role: form.role });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Edit size={16} className="text-nexus-500" />
            Edit User
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email Address</label>
            <input className="input bg-slate-50 text-slate-400 cursor-not-allowed" value={user.email} disabled />
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as NexusUser["role"] })}
            >
              <option value="VIEWER">Viewer</option>
              <option value="SUPPORT">Support</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<NexusUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<NexusUser | null>(null);
  const [actionUser, setActionUser] = useState<NexusUser | null>(null);
  const [actionType, setActionType] = useState<"disable" | "revoke" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userService.getAll();
      setUsers(data);
    } catch {
      setUsers([]);
      setError("Failed to load data. API unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDisable(u: NexusUser) {
    setActionLoading(true);
    try {
      await userService.disable(u.email);
    } catch { /* ok */ }
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, active: false } : x));
    setActionUser(null);
    setActionType(null);
    setActionLoading(false);
  }

  async function handleRevoke(u: NexusUser) {
    setActionLoading(true);
    try {
      await userService.revokeSessions(u.email);
    } catch { /* ok */ }
    setActionUser(null);
    setActionType(null);
    setActionLoading(false);
  }

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.active).length;
  const adminUsers = users.filter((u) => u.role === "SUPER_ADMIN" || u.role === "ADMIN").length;
  const loginToday = users.filter((u) => isLoginToday(u.lastLogin)).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900">Users</h1>
            {error && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} /> {error}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={load} disabled={loading} className="btn-secondary py-1.5 px-3 text-xs">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              <Plus size={15} />
              Add User
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center justify-between mb-1">
              <span className="stat-label">Total Users</span>
              <Users size={15} className="text-nexus-400" />
            </div>
            <div className="stat-value">{loading ? "—" : totalUsers}</div>
            <div className="text-xs text-slate-400 mt-1">Nexus admin accounts</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between mb-1">
              <span className="stat-label">Active</span>
              <CheckCircle2 size={15} className="text-emerald-400" />
            </div>
            <div className="stat-value">{loading ? "—" : activeUsers}</div>
            <div className="text-xs text-slate-400 mt-1">Enabled accounts</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between mb-1">
              <span className="stat-label">Admins</span>
              <Shield size={15} className="text-purple-400" />
            </div>
            <div className="stat-value">{loading ? "—" : adminUsers}</div>
            <div className="text-xs text-slate-400 mt-1">Admin + Super Admin</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-between mb-1">
              <span className="stat-label">Last Login Today</span>
              <Clock size={15} className="text-blue-400" />
            </div>
            <div className="stat-value">{loading ? "—" : loginToday}</div>
            <div className="text-xs text-slate-400 mt-1">Active today</div>
          </div>
        </div>

        {/* Users Table */}
        <div className="table-container">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Users size={14} className="text-nexus-500" />
              All Users
            </h2>
            <span className="text-xs text-slate-400">{loading ? "…" : `${totalUsers} users`}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Last Login</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full ${avatarColor(u.id)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                          {avatarInitials(u.name)}
                        </span>
                        <span className="font-medium text-slate-800">{u.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                        <Mail size={12} className="text-slate-400" />
                        {u.email}
                      </div>
                    </td>
                    <td>
                      <span className={roleBadge(u.role)}>{roleLabel(u.role)}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                        <Clock size={12} className="text-slate-300" />
                        {u.lastLogin ? timeAgo(u.lastLogin) : <span className="text-slate-300">Never</span>}
                      </div>
                    </td>
                    <td>
                      {u.active ? (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="text-slate-400 text-xs">{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          title="Edit"
                          onClick={() => setEditUser(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-nexus-600 hover:bg-nexus-50 transition-colors"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          title="Disable account"
                          onClick={() => { setActionUser(u); setActionType("disable"); }}
                          disabled={!u.active}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <UserX size={13} />
                        </button>
                        <button
                          title="Revoke sessions"
                          onClick={() => { setActionUser(u); setActionType("revoke"); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Lock size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Role Permissions Matrix */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-slate-100">
            <Shield size={14} className="text-nexus-500" />
            <h2 className="text-sm font-semibold text-slate-800">Role Permissions Matrix</h2>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th className="w-64">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center">
                      <span className={roleBadge(r)}>{roleLabel(r)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm) => (
                  <tr key={perm.label}>
                    <td className="font-medium text-slate-700">{perm.label}</td>
                    {ROLES.map((role) => (
                      <td key={role} className="text-center">
                        {perm[role] ? (
                          <CheckCircle2 size={15} className="text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-slate-200 text-lg leading-none select-none">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add User Dialog */}
      <AddUserDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(u) => setUsers((prev) => [u, ...prev])}
      />

      {/* Edit User Dialog */}
      <EditUserDialog
        user={editUser}
        onClose={() => setEditUser(null)}
        onSaved={(u) => {
          setUsers((prev) => prev.map((x) => x.id === u.id ? u : x));
          setEditUser(null);
        }}
      />

      {/* Confirm Action Dialog */}
      {actionUser && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4">
            <div className="flex items-center gap-3 mb-4">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${actionType === "disable" ? "bg-amber-100" : "bg-red-100"}`}>
                {actionType === "disable"
                  ? <UserX size={18} className="text-amber-600" />
                  : <Lock size={18} className="text-red-600" />}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {actionType === "disable" ? "Disable Account" : "Revoke All Sessions"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{actionUser.name}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              {actionType === "disable"
                ? "This will prevent the user from logging in. You can re-enable them later."
                : "This will sign out the user from all active sessions immediately."}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => { setActionUser(null); setActionType(null); }}
              >
                Cancel
              </button>
              <button
                className={actionType === "disable" ? "btn-danger" : "btn-danger"}
                disabled={actionLoading}
                onClick={() => actionType === "disable" ? handleDisable(actionUser) : handleRevoke(actionUser)}
              >
                {actionLoading
                  ? <RefreshCw size={14} className="animate-spin" />
                  : actionType === "disable" ? <UserX size={14} /> : <Lock size={14} />}
                {actionLoading ? "Processing…" : actionType === "disable" ? "Disable User" : "Revoke Sessions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
