import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <div className="w-16 h-16 bg-controlcenter-100 rounded-2xl flex items-center justify-center">
        <Zap size={32} className="text-controlcenter-600" />
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">404</h1>
        <p className="text-slate-500">This page doesn&apos;t exist in Control Center.</p>
      </div>
      <Link href="/" className="btn-primary">
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>
    </div>
  );
}
