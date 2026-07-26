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
      width: 220,
      minHeight: "100vh",
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      position: "fixed",
      top: 0,
      left: 0,
      zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "var(--purple)", letterSpacing: 3 }}>RTLD</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: 2, marginTop: 2 }}>MORE BRAINS CMS</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                color: active ? "var(--purple)" : "var(--text)",
                background: active ? "rgba(204,0,255,0.08)" : "transparent",
                textDecoration: "none",
                transition: "all 0.1s",
              }}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: "16px 12px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            cursor: "pointer",
            letterSpacing: 1,
          }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
