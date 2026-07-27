"use client";
import { Fragment, useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface PlayerRow {
  id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  registered_at: string | null;
  country: string | null;
  hidden: boolean;
  best_score_alltime: number;
  best_score_period: number;
  best_level: number;
  games_played: number;
  wheel_spins: number;
}

type SortKey = keyof PlayerRow;
const PAGE_SIZE = 25;

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "display_name",      label: "Display Name" },
  { key: "username",          label: "Username" },
  { key: "email",             label: "Email" },
  { key: "country",           label: "Country" },
  { key: "registered_at",     label: "Registered" },
  { key: "best_score_alltime",label: "Best Score", align: "right" },
  { key: "best_score_period", label: "Period Score", align: "right" },
  { key: "games_played",      label: "Games",       align: "right" },
  { key: "best_level",        label: "Best Level",  align: "right" },
  { key: "wheel_spins",       label: "Wheel Spins", align: "right" },
];

export default function PlayersPage() {
  const [players,     setPlayers]     = useState<PlayerRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState("");
  const [dateFrom,    setDateFrom]    = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [dateTo,      setDateTo]      = useState(() => new Date().toISOString().slice(0, 10));
  const [sortKey,     setSortKey]     = useState<SortKey>("registered_at");
  const [sortDir,     setSortDir]     = useState<"asc" | "desc">("desc");
  const [page,        setPage]        = useState(1);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [editScore,   setEditScore]   = useState<Record<string, string>>({});
  const [reason,      setReason]      = useState<Record<string, string>>({});
  const [msgs,        setMsgs]        = useState<Record<string, string>>({});

  function exportCSV() {
    const rows = [
      ["Display Name", "Username", "Email", "Country", "Registered", "Best Score", "Period Score", "Games", "Best Level", "Wheel Spins"],
      ...filtered.map(p => [
        p.display_name ?? "",
        p.username ?? "",
        p.email ?? "",
        p.country ?? "",
        p.registered_at ? new Date(p.registered_at).toLocaleDateString("en-US") : "",
        p.best_score_alltime,
        p.best_score_period,
        p.games_played,
        p.best_level,
        p.wheel_spins,
      ]),
    ];
    const blob = new Blob([rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `players-${dateFrom}-to-${dateTo}.csv`; a.click();
  }

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const from = new Date(dateFrom).toISOString();
    const to   = new Date(dateTo + "T23:59:59").toISOString();
    const { data, error } = await supabase.rpc("get_player_roster", { p_from: from, p_to: to });
    if (!error && data) setPlayers(data as PlayerRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let rows: PlayerRow[] = q
      ? players.filter(p =>
          [p.display_name, p.username, p.email, p.country]
            .some(v => (v ?? "").toLowerCase().includes(q))
        )
      : players;

    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number")
        return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [players, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  }

  async function toggleHidden(player: PlayerRow) {
    const supabase = createClient();
    const hidden = !player.hidden;
    await supabase.from("profiles").update({ hidden }).eq("id", player.id);
    await supabase.from("cms_audit_log").insert({
      action: hidden ? "player_hidden" : "player_unhidden",
      target_type: "profile", target_id: player.id,
      details: { display_name: player.display_name, reason: reason[player.id] ?? "" },
    });
    setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, hidden } : p));
    flash(player.id, hidden ? "Player hidden" : "Player restored");
  }

  async function saveScore(player: PlayerRow) {
    const newScore = parseInt(editScore[player.id] ?? "");
    if (isNaN(newScore) || newScore < 0) return;
    const supabase = createClient();
    await supabase.from("scores").insert({ user_id: player.id, score: newScore, played_at: new Date().toISOString() });
    await supabase.from("cms_audit_log").insert({
      action: "score_edited", target_type: "profile", target_id: player.id,
      details: { display_name: player.display_name, reason: reason[player.id] ?? "" },
    });
    setPlayers(prev => prev.map(p =>
      p.id === player.id ? { ...p, best_score_alltime: Math.max(p.best_score_alltime, newScore) } : p
    ));
    setEditScore(prev => ({ ...prev, [player.id]: "" }));
    flash(player.id, "Score updated");
  }

  function flash(id: string, msg: string) {
    setMsgs(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => setMsgs(prev => { const n = { ...prev }; delete n[id]; return n; }), 2500);
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={h1}>Players</h1>
          <p style={muted}>
            {loading ? "Loading…" : `${filtered.length.toLocaleString()} of ${players.length.toLocaleString()} players`}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name, username, email, country…"
          style={{ flex: 1, minWidth: 220 }}
        />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 150 }} />
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 150 }} />
        <button onClick={load} disabled={loading} style={btnPrimary}>
          {loading ? "Loading…" : "Apply"}
        </button>
        <button onClick={exportCSV} disabled={filtered.length === 0} style={btnSecondary}>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              {COLUMNS.map(col => (
                <th
                  key={String(col.key)}
                  onClick={() => toggleSort(col.key)}
                  style={{
                    padding: "10px 14px", fontWeight: 600, fontSize: 11,
                    letterSpacing: 0.5, textTransform: "uppercase",
                    textAlign: col.align ?? "left", cursor: "pointer",
                    color: sortKey === col.key ? "var(--purple)" : "var(--text-muted)",
                    userSelect: "none", whiteSpace: "nowrap",
                  }}>
                  {col.label} {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                </th>
              ))}
              <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(player => (
              <Fragment key={player.id}>
                <tr
                  style={{ borderBottom: "1px solid var(--border)", opacity: player.hidden ? 0.55 : 1 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-base)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}>

                  {/* Display Name */}
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>
                      {player.display_name || "—"}
                      {player.hidden && <span style={hiddenBadge}>HIDDEN</span>}
                    </div>
                  </td>

                  {/* Username */}
                  <td style={{ ...td, color: "var(--text-muted)" }}>@{player.username ?? "—"}</td>

                  {/* Email */}
                  <td style={{ ...td, color: "var(--text-muted)", fontSize: 12 }}>{player.email ?? "—"}</td>

                  {/* Country */}
                  <td style={td}>{player.country ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>

                  {/* Registered */}
                  <td style={td}>
                    {player.registered_at
                      ? new Date(player.registered_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>

                  {/* Best score all-time */}
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "var(--purple)" }}>
                    {player.best_score_alltime > 0 ? player.best_score_alltime.toLocaleString() : "—"}
                  </td>

                  {/* Period score */}
                  <td style={{ ...td, textAlign: "right", color: "#06b6d4" }}>
                    {player.best_score_period > 0 ? player.best_score_period.toLocaleString() : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>

                  {/* Games played */}
                  <td style={{ ...td, textAlign: "right" }}>
                    {player.games_played > 0 ? player.games_played.toLocaleString() : "—"}
                  </td>

                  {/* Best level */}
                  <td style={{ ...td, textAlign: "right" }}>
                    {player.best_level > 0 ? player.best_level : "—"}
                  </td>

                  {/* Wheel spins */}
                  <td style={{ ...td, textAlign: "right" }}>
                    {player.wheel_spins > 0 ? player.wheel_spins.toLocaleString() : "—"}
                  </td>

                  {/* Actions */}
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => setExpandedId(expandedId === player.id ? null : player.id)}
                        style={btnSmall}>
                        {expandedId === player.id ? "Close" : "Edit"}
                      </button>
                      <button
                        onClick={() => toggleHidden(player)}
                        style={{ ...btnSmall, color: player.hidden ? "var(--green)" : "var(--red)", borderColor: player.hidden ? "var(--green)" : "var(--red)" }}>
                        {player.hidden ? "Restore" : "Hide"}
                      </button>
                    </div>
                    {msgs[player.id] && (
                      <div style={{ color: "var(--green)", fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                        {msgs[player.id]}
                      </div>
                    )}
                  </td>
                </tr>

                {/* Inline edit row */}
                {expandedId === player.id && (
                  <tr style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--border)" }}>
                    <td colSpan={11} style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 200 }}>{player.email ?? "No email"}</span>
                        <input
                          type="number"
                          placeholder="Override score"
                          value={editScore[player.id] ?? ""}
                          onChange={e => setEditScore(prev => ({ ...prev, [player.id]: e.target.value }))}
                          style={{ width: 150 }}
                        />
                        <input
                          placeholder="Reason (logged in audit)"
                          value={reason[player.id] ?? ""}
                          onChange={e => setReason(prev => ({ ...prev, [player.id]: e.target.value }))}
                          style={{ width: 220 }}
                        />
                        <button onClick={() => saveScore(player)} style={btnPrimary}>Save Score</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}

            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  {players.length === 0 ? "No players yet" : "No players match your search"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnSmall}>← Prev</button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Page {page} of {totalPages} · {filtered.length.toLocaleString()} players
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnSmall}>Next →</button>
        </div>
      )}

      {/* Country note */}
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        ℹ Country is captured at registration from the player's IP. New registrations will populate this field — existing players will show "—" until they re-register or the field is backfilled.
      </p>
    </div>
  );
}

const h1: React.CSSProperties  = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const btnPrimary: React.CSSProperties   = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const btnSecondary: React.CSSProperties = { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const btnSmall: React.CSSProperties     = { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text)", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
const td: React.CSSProperties         = { padding: "10px 14px", color: "var(--text)", verticalAlign: "middle" };
const hiddenBadge: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "#fef2f2", color: "var(--red)", border: "1px solid #fecaca", marginLeft: 8 };
