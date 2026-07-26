"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/game",      label: "Game Controls",  icon: "🎮" },
  { href: "/players",   label: "Players",        icon: "👥" },
  { href: "/push",      label: "Push Notifs",    icon: "🔔" },
  { href: "/analytics", label: "Analytics",      icon: "📊" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside style={{
      width: 224,
      minHeight: "100vh",
      background: "var(--sidebar-bg)",
      display: "flex",
      flexDirection: "column",
      position: "fixed",
      top: 0,
      left: 0,
      zIndex: 10,
    }}>
      <div style={{ padding: "28px 20px 22px" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: 4 }}>RTLD</div>
        <div style={{ fontSize: 10, color: "var(--sidebar-muted)", letterSpacing: 2, marginTop: 3, textTransform: "uppercase" }}>More Brains CMS</div>
      </div>

      <nav style={{ flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8, fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? "#fff" : "var(--sidebar-text)",
              background: active ? "rgba(255,255,255,0.12)" : "transparent",
              textDecoration: "none", transition: "all 0.15s",
              borderLeft: active ? "3px solid #a78bfa" : "3px solid transparent",
            }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={handleLogout} style={{
          width: "100%", background: "transparent",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "var(--sidebar-text)", borderRadius: 8,
          padding: "8px 12px", fontSize: 12, cursor: "pointer",
        }}>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
