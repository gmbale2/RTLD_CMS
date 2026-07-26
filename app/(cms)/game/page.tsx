"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WheelSegment, Prize, CmsConfig } from "@/lib/types";

// Convert UTC ISO → datetime-local value in LA time
function isoToLAInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  const h = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}`;
}

// Convert datetime-local value (entered as LA time) → UTC ISO
function laInputToISO(local: string): string | null {
  if (!local) return null;
  const utcGuess = new Date(local + ":00Z");
  const laShown = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(utcGuess);
  // laShown: "2024-08-01, 07:00" — the diff tells us the offset
  const laDate = new Date(laShown.replace(", ", "T") + ":00Z");
  const diff = utcGuess.getTime() - laDate.getTime();
  return new Date(utcGuess.getTime() + diff).toISOString();
}

export default function GamePage() {
  const [wheelEnabled, setWheelEnabled] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState("20000");
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [configMsg, setConfigMsg] = useState("");
  const [oddsMsg, setOddsMsg] = useState("");
  const [prizeMsgs, setPrizeMsgs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const [{ data: cfg }, { data: segs }, { data: prs }] = await Promise.all([
      supabase.from("cms_config").select("*"),
      supabase.from("wheel_segments").select("*").order("id"),
      supabase.from("prizes").select("*").order("created_at"),
    ]);
    const cfgMap: Record<string, string> = {};
    (cfg as CmsConfig[] ?? []).forEach(c => { cfgMap[c.key] = c.value; });
    setWheelEnabled(cfgMap["wheel_enabled"] === "true");
    setScoreThreshold(cfgMap["wheel_score_threshold"] ?? "20000");
    setSegments(segs ?? []);
    setPrizes(prs ?? []);
  }

  useEffect(() => { load(); }, []);

  async function saveConfig() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("cms_config").upsert([
      { key: "wheel_enabled", value: String(wheelEnabled) },
      { key: "wheel_score_threshold", value: scoreThreshold },
    ], { onConflict: "key" });
    setConfigMsg(error ? `Error: ${error.message}` : "Saved ✓");
    setSaving(false);
    setTimeout(() => setConfigMsg(""), 3000);
  }

  async function saveAllOdds() {
    const supabase = createClient();
    const updates = segments.map(s => supabase.from("wheel_segments").update({ odds: s.odds, active: s.active }).eq("id", s.id));
    const results = await Promise.all(updates);
    const err = results.find(r => r.error);
    setOddsMsg(err ? `Error: ${err.error!.message}` : "Odds saved ✓");
    setTimeout(() => setOddsMsg(""), 3000);
  }

  function updateSegmentOdds(id: string, odds: number) {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, odds } : s));
  }

  function toggleSegment(id: string, active: boolean) {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, active } : s));
  }

  async function savePrize(prize: Prize) {
    const supabase = createClient();
    const { error } = await supabase.from("prizes").update({
      name: prize.name,
      description: prize.description,
      active: prize.active,
      period_start: prize.period_start,
      period_end: prize.period_end,
      rank_from: prize.rank_from,
      rank_to: prize.rank_to,
      shopify_product_url: prize.shopify_product_url,
      email_body: prize.email_body,
    }).eq("id", prize.id);
    setPrizeMsgs(prev => ({ ...prev, [prize.id]: error ? `Error: ${error.message}` : "Saved ✓" }));
    setTimeout(() => setPrizeMsgs(prev => { const n = { ...prev }; delete n[prize.id]; return n; }), 3000);
  }

  function updatePrize(id: string, field: keyof Prize, value: unknown) {
    setPrizes(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  const activeSegments = segments.filter(s => s.active);
  const totalOdds = activeSegments.reduce((sum, s) => sum + (s.odds ?? 0), 0);
  const oddsOk = Math.abs(totalOdds - 100) < 0.5;

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={h1}>Game Controls</h1>
      <p style={muted}>Wheel settings and prize management</p>

      {/* Wheel Config */}
      <section style={{ ...card, marginTop: 24 }}>
        <div style={sectionTitle}>Wheel of Fortune</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={rowBetween}>
            <div>
              <div style={fieldLabel}>Wheel Enabled</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Show the wheel to players who reach the score threshold</div>
            </div>
            <Toggle value={wheelEnabled} onChange={setWheelEnabled} />
          </div>

          <div>
            <div style={fieldLabel}>Score Threshold</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
              <input type="number" value={scoreThreshold} onChange={e => setScoreThreshold(e.target.value)} style={{ width: 160 }} />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>points required to spin</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={saveConfig} disabled={saving} style={btnPrimary}>
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {configMsg && <span style={{ fontSize: 13, color: configMsg.startsWith("Error") ? "var(--red)" : "var(--green)" }}>{configMsg}</span>}
          </div>
        </div>
      </section>

      {/* Segment Odds */}
      <section style={{ ...card, marginTop: 20 }}>
        <div style={{ ...rowBetween, marginBottom: 20 }}>
          <div style={sectionTitle}>Segment Odds</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: oddsOk ? "var(--green)" : "var(--yellow)" }}>
              Total: {totalOdds.toFixed(1)}% {oddsOk ? "✓" : "(must equal 100%)"}
            </span>
            <button onClick={saveAllOdds} style={btnPrimary}>Save Odds</button>
          </div>
        </div>

        {oddsMsg && (
          <div style={{ marginBottom: 16, padding: "8px 14px", borderRadius: 6, background: oddsMsg.startsWith("Error") ? "#fef2f2" : "#f0fdf4", color: oddsMsg.startsWith("Error") ? "var(--red)" : "var(--green)", fontSize: 13, border: `1px solid ${oddsMsg.startsWith("Error") ? "#fecaca" : "#bbf7d0"}` }}>
            {oddsMsg}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {segments.map(seg => (
            <div key={seg.id} style={{ display: "flex", gap: 16, alignItems: "center", padding: "14px 16px", background: "var(--bg-base)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <Toggle value={seg.active} onChange={v => toggleSegment(seg.id, v)} />
              <div style={{ flex: 1, opacity: seg.active ? 1 : 0.4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>{seg.label}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    type="range" min={0} max={100} step={0.5}
                    value={seg.odds ?? 0}
                    disabled={!seg.active}
                    onChange={e => updateSegmentOdds(seg.id, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: "var(--purple)" }}
                  />
                  <input
                    type="number" min={0} max={100} step={0.5}
                    value={seg.odds ?? 0}
                    disabled={!seg.active}
                    onChange={e => updateSegmentOdds(seg.id, parseFloat(e.target.value) || 0)}
                    style={{ width: 80, textAlign: "center", fontWeight: 700, color: "var(--purple)" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 16 }}>%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Prizes */}
      <section style={{ ...card, marginTop: 20 }}>
        <div style={{ ...sectionTitle, marginBottom: 24 }}>Prizes & Leaderboard Rewards</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {prizes.map(prize => (
            <div key={prize.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "20px" }}>
              <div style={{ ...rowBetween, marginBottom: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{prize.name}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Active</span>
                  <Toggle value={prize.active} onChange={v => updatePrize(prize.id, "active", v)} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={fieldLabel}>Description</div>
                  <input value={prize.description ?? ""} onChange={e => updatePrize(prize.id, "description", e.target.value)} placeholder="e.g. RTLD Signed Poster" />
                </div>
                <div>
                  <div style={fieldLabel}>Shopify Product URL</div>
                  <input value={prize.shopify_product_url ?? ""} onChange={e => updatePrize(prize.id, "shopify_product_url", e.target.value)} placeholder="https://..." />
                </div>

                <div>
                  <div style={fieldLabel}>Period Start <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(Los Angeles time)</span></div>
                  <input
                    type="datetime-local"
                    value={isoToLAInput(prize.period_start)}
                    onChange={e => updatePrize(prize.id, "period_start", laInputToISO(e.target.value))}
                  />
                </div>
                <div>
                  <div style={fieldLabel}>Period End <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(blank = ongoing)</span></div>
                  <input
                    type="datetime-local"
                    value={isoToLAInput(prize.period_end)}
                    onChange={e => updatePrize(prize.id, "period_end", laInputToISO(e.target.value) || null as unknown as string)}
                  />
                </div>

                <div>
                  <div style={fieldLabel}>Rank From</div>
                  <input type="number" min={1} value={prize.rank_from ?? 1} onChange={e => updatePrize(prize.id, "rank_from", parseInt(e.target.value))} />
                </div>
                <div>
                  <div style={fieldLabel}>Rank To</div>
                  <input type="number" min={1} value={prize.rank_to ?? 1} onChange={e => updatePrize(prize.id, "rank_to", parseInt(e.target.value))} />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={fieldLabel}>Winner Email Body</div>
                  <textarea rows={3} value={prize.email_body ?? ""} onChange={e => updatePrize(prize.id, "email_body", e.target.value)} placeholder="Congratulations! You've won…" style={{ resize: "vertical" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 16 }}>
                <button onClick={() => savePrize(prize)} style={{ ...btnPrimary, width: "auto", padding: "9px 22px" }}>
                  Save Prize
                </button>
                {prizeMsgs[prize.id] && (
                  <span style={{ fontSize: 13, color: prizeMsgs[prize.id].startsWith("Error") ? "var(--red)" : "var(--green)" }}>
                    {prizeMsgs[prize.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, flexShrink: 0,
      background: value ? "var(--purple)" : "#d1d5db",
      border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s",
    }}>
      <span style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: 9, background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 0 };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 };
const rowBetween: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
