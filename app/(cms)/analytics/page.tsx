"use client";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DayCount { date: string; count: number; [key: string]: unknown }
interface TopPlayer { display_name: string; username: string; score: number; [key: string]: unknown }
interface WheelOutcome { label: string; count: number; [key: string]: unknown }

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

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [data, sortKey, sortDir]);

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
              <th key={String(col.key)}
                onClick={() => toggle(col.key)}
                style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
                {col.label} {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}>
              {columns.map(col => (
                <td key={String(col.key)} style={{ padding: "10px 14px", color: "var(--text)" }}>
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
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
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [registrations, setRegistrations] = useState<DayCount[]>([]);
  const [gamesPlayed, setGamesPlayed] = useState<DayCount[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [wheelOutcomes, setWheelOutcomes] = useState<WheelOutcome[]>([]);
  const [totalRegs, setTotalRegs] = useState(0);
  const [totalGames, setTotalGames] = useState(0);
  const [totalSpins, setTotalSpins] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const from = new Date(dateFrom).toISOString();
    const to = new Date(dateTo + "T23:59:59").toISOString();

    const [{ data: regData }, { data: scoreData }, { data: topData }, { data: wheelData }] = await Promise.all([
      supabase.from("profiles").select("created_at").gte("created_at", from).lte("created_at", to),
      supabase.from("scores").select("played_at").gte("played_at", from).lte("played_at", to),
      // scores table has display_name and username directly
      supabase.from("scores").select("user_id, username, display_name, score").order("score", { ascending: false }).limit(200),
      supabase.from("wheel_rewards").select("prize_title, claimed_at").gte("claimed_at", from).lte("claimed_at", to),
    ]);

    // Registrations by day
    const regByDay: Record<string, number> = {};
    (regData ?? []).forEach(r => {
      const day = r.created_at.slice(0, 10);
      regByDay[day] = (regByDay[day] ?? 0) + 1;
    });
    setRegistrations(Object.entries(regByDay).sort().map(([date, count]) => ({ date, count })));
    setTotalRegs(regData?.length ?? 0);

    // Games by day
    const gamesByDay: Record<string, number> = {};
    (scoreData ?? []).forEach(s => {
      const day = s.played_at.slice(0, 10);
      gamesByDay[day] = (gamesByDay[day] ?? 0) + 1;
    });
    setGamesPlayed(Object.entries(gamesByDay).sort().map(([date, count]) => ({ date, count })));
    setTotalGames(scoreData?.length ?? 0);

    // Top players — deduplicate by user_id, keep highest score
    const seen = new Set<string>();
    const deduped: TopPlayer[] = [];
    for (const row of (topData ?? [])) {
      if (!seen.has(row.user_id)) {
        seen.add(row.user_id);
        deduped.push({
          display_name: row.display_name || row.username || "—",
          username: row.username || "—",
          score: row.score,
        });
      }
      if (deduped.length >= 10) break;
    }
    setTopPlayers(deduped);

    // Wheel outcomes — group by prize_title, use claimed_at
    const wByLabel: Record<string, number> = {};
    (wheelData ?? []).forEach(w => {
      const l = w.prize_title ?? "Unknown";
      wByLabel[l] = (wByLabel[l] ?? 0) + 1;
    });
    setWheelOutcomes(Object.entries(wByLabel).map(([label, count]) => ({ label, count })));
    setTotalSpins(wheelData?.length ?? 0);

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function exportCSV() {
    const rows = [
      ["Rank", "Display Name", "Username", "Score"],
      ...topPlayers.map((p, i) => [i + 1, p.display_name, p.username, p.score]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "top-scorers.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const tooltipStyle = { background: "#fff", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "New Registrations", value: totalRegs, color: "var(--purple)" },
          { label: "Games Played", value: totalGames, color: "var(--green)" },
          { label: "Wheel Spins", value: totalSpins, color: "var(--yellow)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={card}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>{label}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color }}>{value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Registrations */}
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
              <SortableTable<DayCount>
                data={registrations}
                defaultSort="date"
                columns={[
                  { key: "date", label: "Date" },
                  { key: "count", label: "New Users", render: r => <strong style={{ color: "var(--purple)" }}>{r.count}</strong> },
                ]}
              />
            </div>
          </>
        ) : <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>No registrations in this period.</p>}
      </div>

      {/* Games Played */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionTitle}>Games Played Over Time</div>
        {gamesPlayed.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={gamesPlayed} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="count" stroke="var(--green)" strokeWidth={2} dot={false} name="Games" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 16 }}>
              <SortableTable<DayCount>
                data={gamesPlayed}
                defaultSort="date"
                columns={[
                  { key: "date", label: "Date" },
                  { key: "count", label: "Games Played", render: r => <strong style={{ color: "var(--green)" }}>{r.count}</strong> },
                ]}
              />
            </div>
          </>
        ) : <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>No games in this period.</p>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Top Scorers */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={sectionTitle}>Top Scorers</div>
            <button onClick={exportCSV} style={btnSecondary}>Export CSV</button>
          </div>
          <SortableTable<TopPlayer>
            data={topPlayers}
            defaultSort="score"
            columns={[
              { key: "display_name", label: "Name" },
              { key: "username", label: "Username" },
              { key: "score", label: "Score", render: r => <strong style={{ color: "var(--purple)" }}>{r.score.toLocaleString()}</strong> },
            ]}
          />
        </div>

        {/* Wheel Outcomes */}
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
                <SortableTable<WheelOutcome>
                  data={wheelOutcomes}
                  defaultSort="count"
                  columns={[
                    { key: "label", label: "Prize" },
                    { key: "count", label: "Times Won", render: r => <strong style={{ color: "var(--yellow)" }}>{r.count}</strong> },
                  ]}
                />
              </div>
            </>
          ) : <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>No wheel spins in this period.</p>}
        </div>
      </div>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, margin: 0 };
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text)" };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" };
