"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { authService, setStepUpTicket, apiError } from "@/services/controlcenter.service";

/**
 * Re-authentication prompt for destructive actions.
 *
 * <p>The API refuses those with `STEP_UP_REQUIRED` rather than a plain 403, and the client
 * interceptor turns that into a window event this dialog listens for. Doing it here means no call
 * site has to know about step-up: an operator clicks Destroy, is asked to confirm their password,
 * and retries — instead of seeing "forbidden" on an action they are in fact allowed to perform.
 */
export const STEP_UP_EVENT = "zgate:step-up-required";

export default function StepUpDialog() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  // The action ("METHOD /path") that was refused; the ticket is issued for exactly that one.
  const [action, setAction] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onRequired = (e: Event) => {
      setAction((e as CustomEvent<{ action?: string }>).detail?.action);
      setOpen(true);
    };
    window.addEventListener(STEP_UP_EVENT, onRequired);
    return () => window.removeEventListener(STEP_UP_EVENT, onRequired);
  }, []);

  async function confirm() {
    setBusy(true);
    try {
      const r = await authService.stepUp(password, mfaCode || undefined, action);
      setStepUpTicket(r.ticket, r.expiresInSeconds);
      setOpen(false);
      setPassword("");
      setMfaCode("");
      setNeedsMfa(false);
      toast.success("Confirmed — repeat the action now. The confirmation works once, for that action only.");
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (e as any)?.response?.data?.code;
      if (code === "MFA_REQUIRED") {
        setNeedsMfa(true);
        toast.info("Enter the code from your authenticator app");
      } else {
        toast.error(apiError(e, "Could not confirm your identity"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-controlcenter-600" /> Confirm it&apos;s you
        </h2>
        <p className="text-sm text-slate-600">
          This action is sensitive, so it needs your password even though you&apos;re already
          signed in.
        </p>
        {action && <p className="text-xs text-slate-400 font-mono break-all">{action}</p>}

        <div>
          <label className="text-xs font-medium text-slate-500">Password</label>
          <input
            className="input mt-1 w-full"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && password) confirm(); }}
          />
        </div>

        {needsMfa && (
          <div>
            <label className="text-xs font-medium text-slate-500">Authenticator code</label>
            <input
              className="input mt-1 w-full tracking-[0.4em] text-center"
              inputMode="numeric"
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => { setOpen(false); setPassword(""); }}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !password} onClick={confirm}>
            {busy ? "Confirming…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
