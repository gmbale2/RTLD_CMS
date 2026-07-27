"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface LeaderboardWinner {
  prize_id: string;
  prize_title: string;
  prize_description: string | null;
  period_start: string;
  period_end: string;
  rank_from: number;
  rank_to: number;
  winner_rank: number;
  display_name: string;
  username: string | null;
  email: string | null;
  best_score: number;
}

interface WheelWinner {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  country: string | null;
  prize_title: string;
  prize_desc: string | null;
  score: number;
  level: number;
  claimed_at: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PrizeWinnersPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [leaderboardGroups, setLeaderboardGroups] = useState<{ meta: LeaderboardWinner; winners: LeaderboardWinner[] }[]>([]);
  const [wheelWinners, setWheelWinners] = useState<WheelWinner[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const from = new Date(dateFrom).toISOString();
    const to   = new Date(dateTo + "T23:59:59").toISOString();

    const [{ data: lbData }, { data: wheelData }] = await Promise.all([
      supabase.rpc("get_prize_winners_analytics", { p_from: from, p_to: to }),
      supabase
        .from("wheel_rewards")
        .select("id, user_id, username, prize_title, prize_desc, score, level, claimed_at")
        .eq("prize_type", "shopify")
        .gte("claimed_at", from)
        .lte("claimed_at", to)
        .order("claimed_at", { ascending: false }),
    ]);

    // Group leaderboard winners by prize
    const groups: Record<string, { meta: LeaderboardWinner; winners: LeaderboardWinner[] }> = {};
    (lbData ?? []).forEach((w: LeaderboardWinner) => {
      if (!groups[w.prize_id]) groups[w.prize_id] = { meta: w, winners: [] };
      groups[w.prize_id].winners.push(w);
    });
    setLeaderboardGroups(Object.values(groups));

    // Fetch profiles for wheel winners to get display_name + email
    const wheelRows = (wheelData ?? []) as WheelWinner[];
    const userIds = [...new Set(wheelRows.map(r => r.user_id).filter(Boolean))];
    let profileMap: Record<string, { display_name: string | null; email: string | null; country: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, display_name, email, country")
        .in("id", userIds);
      (profileData ?? []).forEach(p => { profileMap[p.id] = { display_name: p.display_name, email: p.email, country: p.country }; });
    }
    setWheelWinners(wheelRows.map(r => ({
      ...r,
      display_name: profileMap[r.user_id]?.display_name ?? r.username ?? "—",
      email:        profileMap[r.user_id]?.email ?? null,
      country:      profileMap[r.user_id]?.country ?? null,
    })));

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function exportLeaderboardCSV() {
    const rows = [["Prize", "Period End", "Rank", "Display Name", "Username", "Email", "Best Score"]];
    leaderboardGroups.forEach(g => {
      g.winners.forEach(w => {
        rows.push([g.meta.prize_title, fmt(g.meta.period_end), String(w.winner_rank), w.display_name, w.username ?? "", w.email ?? "", String(w.best_score)]);
      });
    });
    downloadCSV(rows, "leaderboard-winners.csv");
  }

  function exportWheelCSV() {
    const rows = [["Prize", "Date Won", "Display Name", "Username", "Email", "Country", "Score at Spin", "Level"]];
    wheelWinners.forEach(w => {
      rows.push([w.prize_title, fmt(w.claimed_at), w.display_name ?? "", w.username ?? "", w.email ?? "", w.country ?? "", String(w.score), String(w.level)]);
    });
    downloadCSV(rows, "wheel-shopify-winners.csv");
  }

  function downloadCSV(rows: string[][], filename: string) {
    const blob = new Blob([rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={h1}>Prize Winners</h1>
          <p style={muted}>Leaderboard prize recipients and wheel product wins</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ color: "var(--text-muted)" }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 150 }} />
          <button onClick={load} disabled={loading} style={btnPrimary}>{loading ? "Loading…" : "Apply"}</button>
        </div>
      </div>

      {/* ── Leaderboard Prize Winners ── */}
      <section style={{ ...card, marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={sectionTitle}>Leaderboard Prize Winners</div>
          <button onClick={exportLeaderboardCSV} disabled={leaderboardGroups.length === 0} style={btnSecondary}>Export CSV</button>
        </div>
        <p style={subMuted}>Prizes whose period ended within the selected date range, ranked by best score during the prize window.</p>

        {leaderboardGroups.length === 0 ? (
          <p style={empty}>No concluded prizes in this period.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {leaderboardGroups.map(group => (
              <div key={group.meta.prize_id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ background: "var(--bg-base)", padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{group.meta.prize_title}</div>
                  {group.meta.prize_description && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{group.meta.prize_description}</div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5, display: "flex", gap: 16 }}>
                    <span>{fmt(group.meta.period_start)} → {fmt(group.meta.period_end)}</span>
                    <span>Rewarding ranks {group.meta.rank_from}–{group.meta.rank_to}</span>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Rank", "Display Name", "Username", "Email", "Best Score"].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.winners.map(w => (
                      <tr key={w.winner_rank} style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-base)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <td style={{ ...td, fontWeight: 700, color: "var(--purple)", width: 60 }}>#{w.winner_rank}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{w.display_name}</td>
                        <td style={{ ...td, color: "var(--text-muted)" }}>@{w.username ?? "—"}</td>
                        <td style={{ ...td, color: "var(--text-muted)" }}>{w.email ?? "—"}</td>
                        <td style={{ ...td, fontWeight: 700, color: "var(--green)", textAlign: "right" }}>{w.best_score.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Wheel Shopify Winners ── */}
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={sectionTitle}>Wheel — Product Winners</div>
          <button onClick={exportWheelCSV} disabled={wheelWinners.length === 0} style={btnSecondary}>Export CSV</button>
        </div>
        <p style={subMuted}>Players who won a physical/Shopify product from the wheel (excludes discounts, add-ups, and multipliers).</p>

        {wheelWinners.length === 0 ? (
          <p style={empty}>No product prizes won in this period.</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginTop: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Date Won", "Prize", "Display Name", "Username", "Email", "Country", "Score", "Level"].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wheelWinners.map(w => (
                  <tr key={w.id} style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-base)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td style={{ ...td, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmt(w.claimed_at)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{w.prize_title}</td>
                    <td style={td}>{w.display_name ?? "—"}</td>
                    <td style={{ ...td, color: "var(--text-muted)" }}>@{w.username ?? "—"}</td>
                    <td style={{ ...td, color: "var(--text-muted)" }}>{w.email ?? "—"}</td>
                    <td style={{ ...td, color: "var(--text-muted)" }}>{w.country ?? "—"}</td>
                    <td style={{ ...td, fontWeight: 700, color: "var(--purple)", textAlign: "right" }}>{w.score.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }}>{w.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const h1: React.CSSProperties         = { fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" };
const muted: React.CSSProperties      = { color: "var(--text-muted)", fontSize: 13, margin: 0 };
const subMuted: React.CSSProperties   = { color: "var(--text-muted)", fontSize: 12, margin: "0 0 16px" };
const empty: React.CSSProperties      = { color: "var(--text-muted)", fontSize: 13, padding: "16px 0", margin: 0 };
const card: React.CSSProperties       = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text)" };
const th: React.CSSProperties         = { padding: "9px 14px", textAlign: "left" as const, color: "var(--text-muted)", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" as const };
const td: React.CSSProperties         = { padding: "10px 14px", color: "var(--text)", verticalAlign: "middle" };
const btnPrimary: React.CSSProperties  = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)", borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: "pointer" };
