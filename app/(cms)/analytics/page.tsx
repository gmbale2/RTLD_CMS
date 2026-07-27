"use client";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DayCount    { date: string; count: number; players: number; [key: string]: unknown }
interface TopPlayer   { display_name: string; username: string; score: number; country: string; [key: string]: unknown }
interface WheelOutcome{ label: string; count: number; [key: string]: unknown }
interface CountryStat { country: string; count: number; [key: string]: unknown }
interface PrizeWinner {
  prize_id: string; prize_title: string; prize_description: string | null;
  period_start: string; period_end: string;
  rank_from: number; rank_to: number; winner_rank: number;
  display_name: string; username: string | null; email: string | null; best_score: number;
  [key: string]: unknown;
}

type SortDir = "asc" | "desc";

function SortableTable<T extends Record<string, unknown>>({
  columns, data, defaultSort,
}: {
  columns: { key: keyof T; label: string; render?: (v: T) => React.ReactNode }[];
  data: T[];
  defaultSort: keyof T;
}) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultSort);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const sorted = useMemo(() => [...data].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  }), [data, sortKey, sortDir]);
  function toggle(key: keyof T) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)" }}>
            {columns.map(col => (
              <th key={String(col.key)} onClick={() => toggle(col.key)}
                style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
                {col.label} {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-base)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}>
              {columns.map(col => (
                <td key={String(col.key)} style={{ padding: "10px 14px", color: "var(--text)" }}>
                  {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={columns.length} style={{ padding: "24px 14px", color: "var(--text-muted)", textAlign: "center" }}>No data for this period</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [dateTo,   setDateTo]   = useState(() => new Date().toISOString().slice(0, 10));
  const [registrations,   setRegistrations]   = useState<DayCount[]>([]);
  const [gamesPlayed,     setGamesPlayed]     = useState<DayCount[]>([]);
  const [topPlayers,      setTopPlayers]      = useState<TopPlayer[]>([]);
  const [wheelOutcomes,   setWheelOutcomes]   = useState<WheelOutcome[]>([]);
  const [regByCountry,    setRegByCountry]    = useState<CountryStat[]>([]);
  const [gamesByCountry,  setGamesByCountry]  = useState<CountryStat[]>([]);
  const [prizeWinners,    setPrizeWinners]    = useState<PrizeWinner[]>([]);
  const [totalRegs,           setTotalRegs]           = useState(0);
  const [totalGames,          setTotalGames]          = useState(0);
  const [totalUniquePlayers,  setTotalUniquePlayers]  = useState(0);
  const [totalSpins,          setTotalSpins]          = useState(0);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const from = new Date(dateFrom).toISOString();
    const to   = new Date(dateTo + "T23:59:59").toISOString();

    const [{ data: regData }, { data: scoreData }, { data: topData }, { data: wheelData }, { data: winnersData }] = await Promise.all([
      supabase.from("profiles").select("created_at, country").gte("created_at", from).lte("created_at", to),
      supabase.from("scores").select("played_at, user_id").gte("played_at", from).lte("played_at", to),
      supabase.from("scores").select("user_id, username, display_name, score").gte("played_at", from).lte("played_at", to).order("score", { ascending: false }).limit(200),
      supabase.from("wheel_rewards").select("prize_title, claimed_at").gte("claimed_at", from).lte("claimed_at", to),
      supabase.rpc("get_prize_winners_analytics", { p_from: from, p_to: to }),
    ]);

    // Registrations by day + by country
    const regByDay: Record<string, number> = {};
    const regCountry: Record<string, number> = {};
    (regData ?? []).forEach(r => {
      const day = r.created_at.slice(0, 10);
      regByDay[day] = (regByDay[day] ?? 0) + 1;
      const c = r.country || "Unknown";
      regCountry[c] = (regCountry[c] ?? 0) + 1;
    });
    setRegistrations(Object.entries(regByDay).sort().map(([date, count]) => ({ date, count, players: 0 })));
    setTotalRegs(regData?.length ?? 0);
    setRegByCountry(Object.entries(regCountry).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 10));

    // Fetch country for all players who played in this period
    // Filter to valid UUIDs only — scores.user_id is TEXT and may contain non-UUID strings
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uniqueUserIds = [...new Set((scoreData ?? []).map(s => s.user_id).filter(id => id && UUID_RE.test(id)))];
    let userCountryMap: Record<string, string> = {};
    if (uniqueUserIds.length > 0) {
      const { data: profileData } = await supabase.from("profiles").select("id, country").in("id", uniqueUserIds);
      (profileData ?? []).forEach(p => { userCountryMap[p.id] = p.country || "Unknown"; });
    }

    // Games by day + unique players + by country
    const gamesByDay: Record<string, number> = {};
    const playersByDay: Record<string, Set<string>> = {};
    const gamesCountry: Record<string, number> = {};
    (scoreData ?? []).forEach(s => {
      const day = s.played_at.slice(0, 10);
      gamesByDay[day] = (gamesByDay[day] ?? 0) + 1;
      if (!playersByDay[day]) playersByDay[day] = new Set();
      if (s.user_id) playersByDay[day].add(s.user_id);
      const country = userCountryMap[s.user_id] || "Unknown";
      gamesCountry[country] = (gamesCountry[country] ?? 0) + 1;
    });
    setGamesPlayed(Object.entries(gamesByDay).sort().map(([date, count]) => ({ date, count, players: playersByDay[date]?.size ?? 0 })));
    setTotalGames(scoreData?.length ?? 0);
    setTotalUniquePlayers(new Set((scoreData ?? []).map(s => s.user_id).filter(Boolean)).size);
    setGamesByCountry(Object.entries(gamesCountry).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 10));

    // Top players — deduplicate by user_id, keep highest score, attach country
    const seen = new Set<string>();
    const deduped: TopPlayer[] = [];
    for (const row of (topData ?? [])) {
      if (!seen.has(row.user_id)) {
        seen.add(row.user_id);
        deduped.push({
          display_name: row.display_name || row.username || "—",
          username:     row.username || "—",
          score:        row.score,
          country:      userCountryMap[row.user_id] || "—",
        });
      }
      if (deduped.length >= 10) break;
    }
    setTopPlayers(deduped);

    // Wheel outcomes
    const wByLabel: Record<string, number> = {};
    (wheelData ?? []).forEach(w => { const l = w.prize_title ?? "Unknown"; wByLabel[l] = (wByLabel[l] ?? 0) + 1; });
    setWheelOutcomes(Object.entries(wByLabel).map(([label, count]) => ({ label, count })));
    setTotalSpins(wheelData?.length ?? 0);

    setPrizeWinners((winnersData ?? []) as PrizeWinner[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function exportCSV() {
    const rows = [
      ["Rank", "Display Name", "Username", "Country", "Score"],
      ...topPlayers.map((p, i) => [i + 1, p.display_name, p.username, p.country, p.score]),
    ];
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "top-scorers.csv"; a.click();
  }

  const prizeGroups = useMemo(() => {
    const groups: Record<string, { meta: PrizeWinner; winners: PrizeWinner[] }> = {};
    prizeWinners.forEach(w => {
      if (!groups[w.prize_id]) groups[w.prize_id] = { meta: w, winners: [] };
      groups[w.prize_id].winners.push(w);
    });
    return Object.values(groups);
  }, [prizeWinners]);

  const tooltipStyle = { background: "#fff", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
  const countryBarHeight = (n: number) => Math.max(160, n * 32 + 20);

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={h1}>Analytics</h1>
          <p style={muted}>Game and user metrics</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ color: "var(--text-muted)" }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 150 }} />
          <button onClick={load} disabled={loading} style={btnPrimary}>{loading ? "Loading…" : "Apply"}</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "New Registrations", value: totalRegs,          color: "var(--purple)" },
          { label: "Games Played",      value: totalGames,         color: "var(--green)"  },
          { label: "Unique Players",    value: totalUniquePlayers, color: "#06b6d4"        },
          { label: "Wheel Spins",       value: totalSpins,         color: "var(--yellow)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={card}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>{label}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color }}>{value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Registrations over time */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionTitle}>Registrations Over Time</div>
        {registrations.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={registrations} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="count" stroke="var(--purple)" strokeWidth={2} dot={false} name="Registrations" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 16 }}>
              <SortableTable<DayCount> data={registrations} defaultSort="date" columns={[
                { key: "date",  label: "Date" },
                { key: "count", label: "New Users", render: r => <strong style={{ color: "var(--purple)" }}>{r.count}</strong> },
              ]} />
            </div>
          </>
        ) : <p style={empty}>No registrations in this period.</p>}
      </div>

      {/* Games over time */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ ...sectionTitle, marginBottom: 8 }}>Games Played Over Time</div>
        <div style={{ display: "flex", gap: 20, marginBottom: 16, fontSize: 12, color: "var(--text-muted)" }}>
          <span><Dot color="var(--green)" />Total Games</span>
          <span><Dot color="#06b6d4" />Unique Players</span>
        </div>
        {gamesPlayed.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={gamesPlayed} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="count"   stroke="var(--green)" strokeWidth={2} dot={false} name="Games" />
                <Line type="monotone" dataKey="players" stroke="#06b6d4"       strokeWidth={2} dot={false} name="Unique Players" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 16 }}>
              <SortableTable<DayCount> data={gamesPlayed} defaultSort="date" columns={[
                { key: "date",    label: "Date" },
                { key: "count",   label: "Games Played",  render: r => <strong style={{ color: "var(--green)" }}>{r.count}</strong> },
                { key: "players", label: "Unique Players", render: r => <strong style={{ color: "#06b6d4" }}>{r.players}</strong> },
              ]} />
            </div>
          </>
        ) : <p style={empty}>No games in this period.</p>}
      </div>

      {/* Country breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <div style={sectionTitle}>Registrations by Country</div>
          {regByCountry.length > 0 ? (
            <ResponsiveContainer width="100%" height={countryBarHeight(regByCountry.length)}>
              <BarChart data={regByCountry} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <YAxis type="category" dataKey="country" tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={110} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="var(--purple)" radius={[0, 4, 4, 0]} name="Registrations" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={empty}>No data.</p>}
        </div>
        <div style={card}>
          <div style={sectionTitle}>Games by Country</div>
          {gamesByCountry.length > 0 ? (
            <ResponsiveContainer width="100%" height={countryBarHeight(gamesByCountry.length)}>
              <BarChart data={gamesByCountry} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <YAxis type="category" dataKey="country" tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={110} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="var(--green)" radius={[0, 4, 4, 0]} name="Games" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={empty}>No data.</p>}
        </div>
      </div>

      {/* Top Scorers + Wheel Outcomes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={sectionTitle}>Top Scorers</div>
            <button onClick={exportCSV} style={btnSecondary}>Export CSV</button>
          </div>
          <SortableTable<TopPlayer> data={topPlayers} defaultSort="score" columns={[
            { key: "display_name", label: "Name" },
            { key: "country",      label: "Country" },
            { key: "score",        label: "Score", render: r => <strong style={{ color: "var(--purple)" }}>{(r.score as number).toLocaleString()}</strong> },
          ]} />
        </div>
        <div style={card}>
          <div style={sectionTitle}>Wheel Outcomes</div>
          {wheelOutcomes.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={wheelOutcomes} margin={{ top: 5, right: 10, left: -10, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-muted)" }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="var(--yellow)" radius={[4, 4, 0, 0]} name="Spins" />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 16 }}>
                <SortableTable<WheelOutcome> data={wheelOutcomes} defaultSort="count" columns={[
                  { key: "label", label: "Prize" },
                  { key: "count", label: "Times Won", render: r => <strong style={{ color: "var(--yellow)" }}>{r.count}</strong> },
                ]} />
              </div>
            </>
          ) : <p style={empty}>No wheel spins in this period.</p>}
        </div>
      </div>

      {/* Prize Winners */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionTitle}>Prize Winners</div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 20, marginTop: -8 }}>
          Prizes whose period ended within the selected date range, ranked by score during the prize window.
        </p>
        {prizeGroups.length === 0 ? (
          <p style={empty}>No concluded prizes in this period.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {prizeGroups.map(group => (
              <div key={group.meta.prize_id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ background: "var(--bg-base)", padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{group.meta.prize_title}</div>
                  {group.meta.prize_description && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{group.meta.prize_description}</div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, display: "flex", gap: 16 }}>
                    <span>
                      {new Date(group.meta.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {" → "}
                      {new Date(group.meta.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span>Rewarding ranks {group.meta.rank_from}–{group.meta.rank_to}</span>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Rank", "Display Name", "Username", "Email", "Best Score"].map(h => (
                        <th key={h} style={{ padding: "9px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.winners.map(w => (
                      <tr key={w.winner_rank} style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-base)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--purple)", width: 60 }}>#{w.winner_rank}</td>
                        <td style={{ padding: "10px 14px", color: "var(--text)", fontWeight: 600 }}>{w.display_name}</td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>@{w.username ?? "—"}</td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{w.email ?? "—"}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--green)" }}>{w.best_score.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ display: "inline-block", width: 12, height: 3, background: color, verticalAlign: "middle", marginRight: 5, borderRadius: 2 }} />;
}

const h1: React.CSSProperties          = { fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" };
const muted: React.CSSProperties       = { color: "var(--text-muted)", fontSize: 13, margin: 0 };
const empty: React.CSSProperties       = { color: "var(--text-muted)", fontSize: 13, padding: "12px 0", margin: 0 };
const card: React.CSSProperties        = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties= { fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text)" };
const btnPrimary: React.CSSProperties  = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSecondary: React.CSSProperties= { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" };
