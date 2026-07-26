"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function PlayersPage() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [editScore, setEditScore] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});

  async function searchPlayers() {
    if (!search.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, email, hidden, created_at")
      .ilike("display_name", `%${search}%`)
      .limit(20);

    const ids = (data ?? []).map(p => p.id);
    let scores: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: scoreData } = await supabase
        .from("scores")
        .select("user_id, score")
        .in("user_id", ids)
        .order("score", { ascending: false });
      (scoreData ?? []).forEach(s => { if (!scores[s.user_id]) scores[s.user_id] = s.score; });
    }

    setResults((data ?? []).map(p => ({ ...p, score: scores[p.id] ?? 0 })));
    setLoading(false);
  }

  async function toggleHidden(player: Profile) {
    const supabase = createClient();
    const hidden = !player.hidden;
    await supabase.from("profiles").update({ hidden }).eq("id", player.id);
    await supabase.from("cms_audit_log").insert({
      action: hidden ? "player_hidden" : "player_unhidden",
      target_type: "profile",
      target_id: player.id,
      details: { display_name: player.display_name, reason: reason[player.id] ?? "" },
    });
    setResults(prev => prev.map(p => p.id === player.id ? { ...p, hidden } : p));
    flash(player.id, hidden ? "Player hidden" : "Player restored");
  }

  async function saveScore(player: Profile) {
    const newScore = parseInt(editScore[player.id] ?? "");
    if (isNaN(newScore)) return;
    const supabase = createClient();
    await supabase.from("scores").insert({ user_id: player.id, score: newScore, played_at: new Date().toISOString() });
    await supabase.from("cms_audit_log").insert({
      action: "score_edited",
      target_type: "profile",
      target_id: player.id,
      details: { display_name: player.display_name, old_score: player.score, new_score: newScore, reason: reason[player.id] ?? "" },
    });
    setResults(prev => prev.map(p => p.id === player.id ? { ...p, score: newScore } : p));
    setEditScore(prev => ({ ...prev, [player.id]: "" }));
    flash(player.id, "Score updated");
  }

  function flash(id: string, text: string) {
    setMsg(prev => ({ ...prev, [id]: text }));
    setTimeout(() => setMsg(prev => { const n = { ...prev }; delete n[id]; return n; }), 2500);
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Players</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>Search, hide, or edit player scores</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && searchPlayers()}
          placeholder="Search by display name…"
          style={{ flex: 1 }}
        />
        <button onClick={searchPlayers} disabled={loading} style={btnPrimary}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {results.map(player => (
            <div key={player.id} style={{ ...card, opacity: player.hidden ? 0.6 : 1 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                    {player.display_name ?? "—"}
                    {player.hidden && <span style={badge("#ff4444")}>HIDDEN</span>}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 3 }}>
                    Top score: <strong style={{ color: "var(--green)" }}>{player.score.toLocaleString()}</strong>
                    &nbsp;· Joined {new Date(player.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Score edit */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    placeholder="New score"
                    value={editScore[player.id] ?? ""}
                    onChange={e => setEditScore(prev => ({ ...prev, [player.id]: e.target.value }))}
                    style={{ width: 120 }}
                  />
                  <button onClick={() => saveScore(player)} style={{ ...btnSmall, color: "var(--yellow)", borderColor: "var(--yellow)" }}>
                    Set Score
                  </button>
                </div>

                {/* Reason input */}
                <input
                  placeholder="Reason (for audit log)"
                  value={reason[player.id] ?? ""}
                  onChange={e => setReason(prev => ({ ...prev, [player.id]: e.target.value }))}
                  style={{ width: 200 }}
                />

                <button
                  onClick={() => toggleHidden(player)}
                  style={{ ...btnSmall, color: player.hidden ? "var(--green)" : "#ff4444", borderColor: player.hidden ? "var(--green)" : "#ff4444" }}
                >
                  {player.hidden ? "Restore" : "Hide"}
                </button>
              </div>
              {msg[player.id] && <div style={{ color: "var(--green)", fontSize: 12, marginTop: 10 }}>{msg[player.id]}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px" };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSmall: React.CSSProperties = { background: "transparent", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
function badge(color: string): React.CSSProperties {
  return { fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "2px 8px", borderRadius: 20, background: `${color}22`, color, border: `1px solid ${color}` };
}
