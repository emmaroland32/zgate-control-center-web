"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, ShieldAlert } from "lucide-react";
import { ssoService, apiError } from "@/services/controlcenter.service";

/**
 * Where the identity provider sends the operator back to.
 *
 * <p>Exchanging the code is a one-shot operation — providers invalidate it on first use — so this
 * guards against React's development double-effect firing it twice, which would surface the second
 * (correctly rejected) attempt as a failed sign-in.
 */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    // The provider's own error text is attacker-linkable — anyone can send an operator a callback
    // URL carrying arbitrary error_description. Show a fixed message; the detail goes to the console.
    const providerError = params.get("error");
    if (providerError) {
      console.warn("SSO provider error:", providerError, params.get("error_description"));
      setError("Your identity provider did not complete the sign-in.");
      return;
    }
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError("The identity provider did not return a sign-in code.");
      return;
    }

    ssoService
      .callback(code, state)
      .then((data) => {
        const token: string = data.accessToken || data.token;
        localStorage.setItem("controlcenter_token", token);
        document.cookie = `controlcenter_token=${token}; path=/; SameSite=Strict; max-age=86400`;
        router.replace("/");
      })
      .catch((e) => setError(apiError(e, "Single sign-on failed")));
  }, [params, router]);

  if (error) {
    return (
      <div className="bg-controlcenter-900 rounded-2xl p-6 shadow-2xl border border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-red-400">
          <ShieldAlert size={18} />
          <h2 className="font-semibold text-sm">Sign-in refused</h2>
        </div>
        <p className="text-sm text-controlcenter-300">{error}</p>
        <button
          onClick={() => router.replace("/login")}
          className="w-full py-2.5 bg-controlcenter-600 hover:bg-controlcenter-500 text-white
                     font-medium rounded-lg transition-colors text-sm"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <p className="text-center text-sm text-controlcenter-400">Completing sign-in…</p>
  );
}

export default function SsoCallbackPage() {
  return (
    <div className="min-h-screen bg-controlcenter-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 bg-controlcenter-600 rounded-2xl flex items-center justify-center shadow-xl">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">ZGATE Control Center</h1>
        </div>
        <Suspense fallback={null}>
          <Callback />
        </Suspense>
      </div>
    </div>
  );
}
