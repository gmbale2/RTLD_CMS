import Sidebar from "@/components/Sidebar";

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ marginLeft: 220, flex: 1, padding: "32px 36px", maxWidth: "calc(100vw - 220px)" }}>
        {children}
      </main>
    </div>
  );
}
