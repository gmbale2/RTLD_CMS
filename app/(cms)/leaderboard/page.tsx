"use client";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface Entry {
  rank: number;
  user_id: string;
  username: string | null;
  display_name: string | null;
  best_score: number;
  best_level: number;
  games_played: number;
  country: string | null;
  email: string | null;
}

interface PeriodEntry {
  user_id: string;
  username: string | null;
  display_name: string | null;
  best_score: number;
  games_played: number;
  country: string | null;
  email: string | null;
}

interface ActivePrize {
  title: string;
  period_start: string;
  period_end: string | null;
  rank_from: number;
  rank_to: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LeaderboardPage() {
  const [mode, setMode] = useState<"alltime" | "period">("alltime");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [periodEntries, setPeriodEntries] = useState<PeriodEntry[]>([]);
  const [activePrize, setActivePrize] = useState<ActivePrize | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const supabase = createClient();

    const [{ data: lbData }, { data: prizeData }] = await Promise.all([
      supabase.from("leaderboard").select("*").order("rank"),
      supabase.from("prizes").select("title, period_start, period_end, rank_from, rank_to")
        .eq("enabled", true)
        .lte("period_start", new Date().toISOString())
        .or(`period_end.is.null,period_end.gte.${new Date().toISOString()}`),
    ]);

    const rows = (lbData ?? []) as Omit<Entry, "country" | "email">[];
    const prize = (prizeData ?? [])[0] as ActivePrize | undefined;
    setActivePrize(prize ?? null);

    // Enrich with profiles (country + email)
    const validIds = rows.map(r => r.user_id).filter(id => id && UUID_RE.test(id));
    let profileMap: Record<string, { country: string | null; email: string | null }> = {};
    if (validIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, country, email").in("id", validIds);
      (profiles ?? []).forEach(p => { profileMap[p.id] = { country: p.country, email: p.email }; });
    }

    setEntries(rows.map(r => ({
      ...r,
      country: profileMap[r.user_id]?.country ?? null,
      email:   profileMap[r.user_id]?.email ?? null,
    })));

    // Period leaderboard — scores within active prize window
    if (prize) {
      const from = prize.period_start;
      const to   = prize.period_end ?? new Date().toISOString();
      const { data: scoreData } = await supabase
        .from("scores")
        .select("user_id, username, display_name, score")
        .gte("played_at", from)
        .lte("played_at", to);

      // Dedupe by user_id, keep best score
      const byUser: Record<string, { username: string | null; display_name: string | null; best_score: number; games: number }> = {};
      (scoreData ?? []).forEach(s => {
        if (!byUser[s.user_id]) byUser[s.user_id] = { username: s.username, display_name: s.display_name, best_score: s.score, games: 0 };
        if (s.score > byUser[s.user_id].best_score) byUser[s.user_id].best_score = s.score;
        byUser[s.user_id].games++;
      });

      const periodIds = Object.keys(byUser).filter(id => UUID_RE.test(id));
      let periodProfileMap: Record<string, { country: string | null; email: string | null }> = {};
      if (periodIds.length > 0) {
        const { data: pp } = await supabase.from("profiles").select("id, country, email").in("id", periodIds);
        (pp ?? []).forEach(p => { periodProfileMap[p.id] = { country: p.country, email: p.email }; });
      }

      const sorted = Object.entries(byUser)
        .map(([uid, v]) => ({
          user_id: uid,
          username: v.username,
          display_name: v.display_name,
          best_score: v.best_score,
          games_played: v.games,
          country: periodProfileMap[uid]?.country ?? null,
          email:   periodProfileMap[uid]?.email ?? null,
        }))
        .sort((a, b) => b.best_score - a.best_score);

      setPeriodEntries(sorted);
    }

    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (mode === "alltime") {
      return entries.filter(e =>
        !q ||
        e.display_name?.toLowerCase().includes(q) ||
        e.username?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.country?.toLowerCase().includes(q)
      );
    } else {
      return periodEntries.filter(e =>
        !q ||
        e.display_name?.toLowerCase().includes(q) ||
        e.username?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.country?.toLowerCase().includes(q)
      );
    }
  }, [mode, entries, periodEntries, search]);

  function exportCSV() {
    if (mode === "alltime") {
      const rows = [
        ["Rank", "Display Name", "Username", "Email", "Country", "Best Score", "Best Level", "Games Played"],
        ...(filtered as Entry[]).map(e => [e.rank, e.display_name ?? "", e.username ?? "", e.email ?? "", e.country ?? "", e.best_score, e.best_level, e.games_played]),
      ];
      dl(rows, "leaderboard-alltime.csv");
    } else {
      const rows = [
        ["Rank", "Display Name", "Username", "Email", "Country", "Best Score (Period)", "Games Played"],
        ...filtered.map((e, i) => [i + 1, e.display_name ?? "", e.username ?? "", e.email ?? "", e.country ?? "", e.best_score, e.games_played]),
      ];
      dl(rows, "leaderboard-period.csv");
    }
  }

  function dl(rows: unknown[][], filename: string) {
    const blob = new Blob(
      [rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")],
      { type: "text/csv" }
    );
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ maxWidth: 1060 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={h1}>Leaderboard</h1>
          <p style={muted}>
            {mode === "alltime"
              ? `${entries.length} ranked players (all-time best scores)`
              : activePrize
                ? `${periodEntries.length} players scored during "${activePrize.title}"`
                : "No active prize period"}
          </p>
        </div>
        <button onClick={exportCSV} disabled={filtered.length === 0} style={btnSecondary}>Export CSV</button>
      </div>

      {/* Mode toggle + search */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {(["alltime", "period"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
              background: mode === m ? "var(--purple)" : "transparent",
              color: mode === m ? "#fff" : "var(--text-muted)",
            }}>
              {m === "alltime" ? "All-Time" : "Active Period"}
            </button>
          ))}
        </div>

        {mode === "period" && activePrize && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px" }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>● </span>
            {activePrize.title} · {fmtDate(activePrize.period_start)} →{" "}
            {activePrize.period_end ? fmtDate(activePrize.period_end) : "ongoing"}
            {" "}· rewarding ranks {activePrize.rank_from}–{activePrize.rank_to}
          </div>
        )}

        {mode === "period" && !activePrize && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
            No active prize — enable one in Leaderboard Prizes to see the period view.
          </div>
        )}

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, username, email, country…"
          style={{ flex: 1, minWidth: 220 }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <p style={muted}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px 24px", color: "var(--text-muted)" }}>
          {search ? "No players match your search." : "No data yet."}
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--bg-base)" }}>
                  {(mode === "alltime"
                    ? ["Rank", "Display Name", "Username", "Email", "Country", "Best Score", "Level", "Games"]
                    : ["Rank", "Display Name", "Username", "Email", "Country", "Best Score (Period)", "Games"]
                  ).map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mode === "alltime"
                  ? (filtered as Entry[]).map((e, i) => (
                    <tr key={e.user_id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-base)" }}
                      onMouseEnter={el => (el.currentTarget.style.background = "rgba(167,139,250,0.06)")}
                      onMouseLeave={(el) => (el.currentTarget.style.background = i % 2 === 0 ? "transparent" : "var(--bg-base)")}>
                      <td style={{ ...td, width: 52 }}>
                        <span style={{ fontWeight: 800, color: e.rank <= 3 ? ["#FFD700","#C0C0C0","#CD7F32"][e.rank-1] : "var(--text-muted)", fontSize: e.rank <= 3 ? 14 : 13 }}>
                          #{e.rank}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: "var(--text)" }}>{e.display_name ?? "—"}</td>
                      <td style={{ ...td, color: "var(--text-muted)" }}>@{e.username ?? "—"}</td>
                      <td style={{ ...td, color: "var(--text-muted)", fontSize: 12 }}>{e.email ?? "—"}</td>
                      <td style={{ ...td, color: "var(--text-muted)" }}>{e.country ?? "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: "var(--purple)", textAlign: "right" }}>{e.best_score.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right", color: "var(--text-muted)" }}>{e.best_level}</td>
                      <td style={{ ...td, textAlign: "right", color: "var(--text-muted)" }}>{e.games_played}</td>
                    </tr>
                  ))
                  : (filtered as PeriodEntry[]).map((e, i) => (
                    <tr key={e.user_id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-base)" }}
                      onMouseEnter={el => (el.currentTarget.style.background = "rgba(167,139,250,0.06)")}
                      onMouseLeave={(el) => (el.currentTarget.style.background = i % 2 === 0 ? "transparent" : "var(--bg-base)")}>
                      <td style={{ ...td, width: 52 }}>
                        <span style={{ fontWeight: 800, color: i < 3 ? ["#FFD700","#C0C0C0","#CD7F32"][i] : "var(--text-muted)", fontSize: i < 3 ? 14 : 13 }}>
                          #{i + 1}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: "var(--text)" }}>{e.display_name ?? "—"}</td>
                      <td style={{ ...td, color: "var(--text-muted)" }}>@{e.username ?? "—"}</td>
                      <td style={{ ...td, color: "var(--text-muted)", fontSize: 12 }}>{e.email ?? "—"}</td>
                      <td style={{ ...td, color: "var(--text-muted)" }}>{e.country ?? "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: "var(--purple)", textAlign: "right" }}>{e.best_score.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right", color: "var(--text-muted)" }}>{e.games_played}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const h1: React.CSSProperties   = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const card: React.CSSProperties  = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const th: React.CSSProperties    = { padding: "9px 14px", textAlign: "left" as const, color: "var(--text-muted)", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
const td: React.CSSProperties    = { padding: "10px 14px", color: "var(--text)", verticalAlign: "middle" };
const btnSecondary: React.CSSProperties = { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
