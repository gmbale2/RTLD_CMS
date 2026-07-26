import Sidebar from "@/components/Sidebar";

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ marginLeft: 224, flex: 1, padding: "36px 40px", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
