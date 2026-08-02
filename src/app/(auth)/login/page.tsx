"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authService, ssoService, apiError } from "@/services/controlcenter.service";
import { Zap, Lock, KeyRound } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);

  // Only offer SSO where it is actually configured — a button that dead-ends is worse than none.
  useEffect(() => {
    ssoService.status().then((r) => setSsoEnabled(r.enabled)).catch(() => setSsoEnabled(false));
  }, []);

  async function handleSso() {
    setSsoBusy(true);
    try {
      const { authorizationUrl } = await ssoService.authorize();
      window.location.href = authorizationUrl;
    } catch (e) {
      toast.error(apiError(e, "Could not start single sign-on"));
      setSsoBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await authService.login(email, password, mfaCode || undefined);
      const token: string = data.accessToken || data.token;

      // Persist in localStorage for Axios interceptor
      localStorage.setItem("controlcenter_token", token);
      // Also set a cookie so middleware can protect routes server-side
      document.cookie = `controlcenter_token=${token}; path=/; SameSite=Strict; max-age=86400`;

      toast.success("Welcome to ZGATE Control Center");
      const next = params.get("next") || "/";
      router.push(next);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (e as any)?.response?.data?.code;
      if (code === "MFA_REQUIRED") {
        setMfaRequired(true);
        toast.info("Enter the code from your authenticator app");
      } else if (code === "ACCOUNT_LOCKED") {
        // Distinct from bad credentials: retrying immediately only extends the backoff.
        toast.error(apiError(e), { duration: 8000 });
      } else {
        toast.error(apiError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleLogin} className="bg-controlcenter-900 rounded-2xl p-6 shadow-2xl border border-white/10 space-y-4">
      <div>
        <label className="block text-xs font-medium text-controlcenter-300 mb-1.5">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@zgate.io"
          required
          className="w-full px-3 py-2.5 bg-controlcenter-800 border border-white/10 rounded-lg text-sm text-white
                     placeholder:text-controlcenter-500 focus:outline-none focus:ring-2 focus:ring-controlcenter-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-controlcenter-300 mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className="w-full px-3 py-2.5 bg-controlcenter-800 border border-white/10 rounded-lg text-sm text-white
                     placeholder:text-controlcenter-500 focus:outline-none focus:ring-2 focus:ring-controlcenter-500"
        />
      </div>
      {mfaRequired && (
        <div>
          <label className="block text-xs font-medium text-controlcenter-300 mb-1.5">Authenticator code</label>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="w-full px-3 py-2.5 bg-controlcenter-800 border border-white/10 rounded-lg text-sm text-white tracking-[0.4em]
                       placeholder:text-controlcenter-500 focus:outline-none focus:ring-2 focus:ring-controlcenter-500"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-controlcenter-600
                   hover:bg-controlcenter-500 disabled:opacity-50 text-white font-medium rounded-lg
                   transition-colors text-sm"
      >
        <Lock size={14} />
        {loading ? "Signing in…" : "Sign in to Control Center"}
      </button>

      {ssoEnabled && (
        <>
          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] uppercase tracking-wider text-controlcenter-500">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <button
            type="button"
            onClick={handleSso}
            disabled={ssoBusy}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-controlcenter-800
                       hover:bg-controlcenter-700 disabled:opacity-50 text-white font-medium
                       rounded-lg border border-white/10 transition-colors text-sm"
          >
            <KeyRound size={14} />
            {ssoBusy ? "Redirecting…" : "Sign in with SSO"}
          </button>
        </>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-controlcenter-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 bg-controlcenter-600 rounded-2xl flex items-center justify-center shadow-xl">
            <Zap size={28} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">ZGATE Control Center</h1>
            <p className="text-controlcenter-400 text-sm">Internal Management</p>
          </div>
        </div>

        {/* Suspense required for useSearchParams in Next.js 15 */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-controlcenter-600 mt-6">
          ZGATE Control Center · Internal Use Only
        </p>
      </div>
    </div>
  );
}
