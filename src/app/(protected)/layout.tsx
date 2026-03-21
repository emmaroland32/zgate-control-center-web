import Sidebar from "@/components/sidebar";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[260px] overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
