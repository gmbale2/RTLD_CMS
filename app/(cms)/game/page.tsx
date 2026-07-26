"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WheelSegment, Prize, CmsConfig } from "@/lib/types";

export default function GamePage() {
  const [wheelEnabled, setWheelEnabled] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState("20000");
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

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
    await Promise.all([
      supabase.from("cms_config").upsert({ key: "wheel_enabled", value: String(wheelEnabled) }, { onConflict: "key" }),
      supabase.from("cms_config").upsert({ key: "wheel_score_threshold", value: scoreThreshold }, { onConflict: "key" }),
    ]);
    setMsg("Saved!");
    setSaving(false);
    setTimeout(() => setMsg(""), 2000);
  }

  async function updateSegmentOdds(id: string, odds: number) {
    const supabase = createClient();
    await supabase.from("wheel_segments").update({ odds }).eq("id", id);
    setSegments(prev => prev.map(s => s.id === id ? { ...s, odds } : s));
  }

  async function toggleSegment(id: string, active: boolean) {
    const supabase = createClient();
    await supabase.from("wheel_segments").update({ active }).eq("id", id);
    setSegments(prev => prev.map(s => s.id === id ? { ...s, active } : s));
  }

  async function savePrize(prize: Prize) {
    const supabase = createClient();
    const { id, ...rest } = prize;
    await supabase.from("prizes").update(rest).eq("id", id);
    setMsg("Prize saved!");
    setTimeout(() => setMsg(""), 2000);
  }

  function updatePrize(id: string, field: keyof Prize, value: unknown) {
    setPrizes(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  const totalOdds = segments.filter(s => s.active).reduce((sum, s) => sum + (s.odds ?? 0), 0);

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Game Controls</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 32 }}>Wheel settings and prize management</p>

      {/* Wheel Config */}
      <section style={card}>
        <h2 style={sectionTitle}>Wheel of Fortune</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={row}>
            <div>
              <div style={fieldLabel}>Wheel Enabled</div>
              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Show the wheel to players who reach the score threshold</div>
            </div>
            <Toggle value={wheelEnabled} onChange={setWheelEnabled} />
          </div>

          <div>
            <div style={fieldLabel}>Score Threshold</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
              <input
                type="number"
                value={scoreThreshold}
                onChange={e => setScoreThreshold(e.target.value)}
                style={{ width: 160 }}
              />
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>points required to spin</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={saveConfig} disabled={saving} style={btnPrimary}>
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {msg && <span style={{ color: "var(--green)", fontSize: 13 }}>{msg}</span>}
          </div>
        </div>
      </section>

      {/* Segment Odds */}
      <section style={{ ...card, marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Segment Odds</h2>
          <span style={{
            fontSize: 12,
            color: Math.abs(totalOdds - 100) < 0.5 ? "var(--green)" : "#ff8800",
          }}>
            Total: {totalOdds.toFixed(1)}% {Math.abs(totalOdds - 100) < 0.5 ? "✓" : "(should equal 100%)"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {segments.map(seg => (
            <div key={seg.id} style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Toggle value={seg.active} onChange={v => toggleSegment(seg.id, v)} />
              <div style={{ flex: 1, opacity: seg.active ? 1 : 0.4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{seg.label}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="range"
                    min={0} max={100} step={0.5}
                    value={seg.odds}
                    disabled={!seg.active}
                    onChange={e => updateSegmentOdds(seg.id, parseFloat(e.target.value))}
                    style={{ flex: 1, padding: 0, background: "transparent", border: "none" }}
                  />
                  <span style={{ width: 52, textAlign: "right", fontSize: 13, color: "var(--purple)", fontWeight: 700 }}>
                    {seg.odds?.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Prizes */}
      <section style={{ ...card, marginTop: 24 }}>
        <h2 style={sectionTitle}>Prizes</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {prizes.map(prize => (
            <div key={prize.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{prize.name}</div>
                <Toggle value={prize.active} onChange={v => { updatePrize(prize.id, "active", v); }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={fieldLabel}>Description</div>
                  <input value={prize.description ?? ""} onChange={e => updatePrize(prize.id, "description", e.target.value)} placeholder="e.g. RTLD Signed Poster" />
                </div>
                <div>
                  <div style={fieldLabel}>Shopify Product URL</div>
                  <input value={prize.shopify_product_url ?? ""} onChange={e => updatePrize(prize.id, "shopify_product_url", e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <div style={fieldLabel}>Period Start</div>
                  <input type="date" value={prize.period_start ? prize.period_start.slice(0, 10) : ""} onChange={e => updatePrize(prize.id, "period_start", e.target.value || null)} />
                </div>
                <div>
                  <div style={fieldLabel}>Period End (blank = ongoing)</div>
                  <input type="date" value={prize.period_end ? prize.period_end.slice(0, 10) : ""} onChange={e => updatePrize(prize.id, "period_end", e.target.value || null)} />
                </div>
                <div>
                  <div style={fieldLabel}>Rank From</div>
                  <input type="number" value={prize.rank_from ?? 1} onChange={e => updatePrize(prize.id, "rank_from", parseInt(e.target.value))} />
                </div>
                <div>
                  <div style={fieldLabel}>Rank To</div>
                  <input type="number" value={prize.rank_to ?? 1} onChange={e => updatePrize(prize.id, "rank_to", parseInt(e.target.value))} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={fieldLabel}>Winner Email Body</div>
                  <textarea rows={3} value={prize.email_body ?? ""} onChange={e => updatePrize(prize.id, "email_body", e.target.value)} placeholder="Congratulations! You've won..." style={{ resize: "vertical" }} />
                </div>
              </div>

              <button onClick={() => savePrize(prize)} style={{ ...btnPrimary, marginTop: 12, fontSize: 12, padding: "7px 18px" }}>
                Save Prize
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? "var(--purple)" : "var(--border)",
        border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: 9,
        background: "#fff", transition: "left 0.2s",
      }} />
    </button>
  );
}

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 20 };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
