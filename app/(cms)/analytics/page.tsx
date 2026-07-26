"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DayCount { date: string; count: number }
interface TopPlayer { display_name: string; score: number; id: string }
interface WheelOutcome { label: string; count: number }

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
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const from = new Date(dateFrom).toISOString();
    const to = new Date(dateTo + "T23:59:59").toISOString();

    const [{ data: regData }, { data: scoreData }, { data: topData }, { data: wheelData }] = await Promise.all([
      supabase.from("profiles").select("created_at").gte("created_at", from).lte("created_at", to),
      supabase.from("scores").select("played_at").gte("played_at", from).lte("played_at", to),
      supabase.from("scores").select("user_id, score").order("score", { ascending: false }).limit(10),
      supabase.from("wheel_rewards").select("segment_label").gte("created_at", from).lte("created_at", to),
    ]);

    // Aggregate registrations by day
    const regByDay: Record<string, number> = {};
    (regData ?? []).forEach(r => {
      const day = r.created_at.slice(0, 10);
      regByDay[day] = (regByDay[day] ?? 0) + 1;
    });
    setRegistrations(Object.entries(regByDay).sort().map(([date, count]) => ({ date, count })));
    setTotalRegs(regData?.length ?? 0);

    // Aggregate games by day
    const gamesByDay: Record<string, number> = {};
    (scoreData ?? []).forEach(s => {
      const day = s.played_at.slice(0, 10);
      gamesByDay[day] = (gamesByDay[day] ?? 0) + 1;
    });
    setGamesPlayed(Object.entries(gamesByDay).sort().map(([date, count]) => ({ date, count })));
    setTotalGames(scoreData?.length ?? 0);

    // Top players — get display names
    const ids = (topData ?? []).map(t => t.user_id);
    let nameMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      (profiles ?? []).forEach(p => { nameMap[p.id] = p.display_name ?? p.id; });
    }
    setTopPlayers((topData ?? []).map(t => ({ id: t.user_id, display_name: nameMap[t.user_id] ?? "—", score: t.score })));

    // Wheel outcomes
    const wByLabel: Record<string, number> = {};
    (wheelData ?? []).forEach(w => {
      const l = w.segment_label ?? "Unknown";
      wByLabel[l] = (wByLabel[l] ?? 0) + 1;
    });
    setWheelOutcomes(Object.entries(wByLabel).map(([label, count]) => ({ label, count })));

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function exportCSV() {
    const rows = [
      ["Rank", "Player", "Score"],
      ...topPlayers.map((p, i) => [i + 1, p.display_name, p.score]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "top-scorers.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const chartProps = {
    margin: { top: 5, right: 10, left: -20, bottom: 5 },
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Analytics</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Game and user metrics</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ color: "var(--text-muted)" }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 150 }} />
          <button onClick={load} disabled={loading} style={btnPrimary}>{loading ? "…" : "Apply"}</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "New Registrations", value: totalRegs, color: "var(--purple)" },
          { label: "Games Played", value: totalGames, color: "var(--green)" },
          { label: "Wheel Spins", value: wheelOutcomes.reduce((a, b) => a + b.count, 0), color: "var(--yellow)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color }}>{value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Registrations chart */}
        <div style={card}>
          <div style={sectionTitle}>Registrations Over Time</div>
          {registrations.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={registrations} {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="var(--purple)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </div>

        {/* Games played chart */}
        <div style={card}>
          <div style={sectionTitle}>Games Played Over Time</div>
          {gamesPlayed.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={gamesPlayed} {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="var(--green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Top Scorers */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={sectionTitle}>Top Scorers</div>
            <button onClick={exportCSV} style={btnSmall}>Export CSV</button>
          </div>
          {topPlayers.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {topPlayers.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 6px", color: "var(--text-muted)", width: 30, fontWeight: 700 }}>#{i + 1}</td>
                    <td style={{ padding: "8px 6px" }}>{p.display_name}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--green)", fontWeight: 700 }}>{p.score.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty />}
        </div>

        {/* Wheel Outcomes */}
        <div style={card}>
          <div style={sectionTitle}>Wheel Outcomes</div>
          {wheelOutcomes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={wheelOutcomes} margin={{ top: 5, right: 10, left: -10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} angle={-35} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="count" fill="var(--yellow)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "20px 0" }}>No data for this period.</p>;
}

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px" };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginBottom: 12 };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSmall: React.CSSProperties = { background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" };
