"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WheelSegment, CmsConfig } from "@/lib/types";

const SEGMENT_TYPES = [
  { value: "multiplier",  label: "Multiplier (×points)" },
  { value: "addup",       label: "Add Points (+pts)" },
  { value: "discount",    label: "Discount Code" },
  { value: "shopify",     label: "Shopify / Free Product" },
  { value: "out_of_luck", label: "No Prize" },
];

export default function WheelPage() {
  const [configId, setConfigId]         = useState<string | null>(null);
  const [wheelEnabled, setWheelEnabled] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState("20000");
  const [segments, setSegments]         = useState<WheelSegment[]>([]);
  const [expandedSeg, setExpandedSeg]   = useState<number | null>(null);
  const [configMsg, setConfigMsg]       = useState("");
  const [segMsg, setSegMsg]             = useState("");
  const [saving, setSaving]             = useState(false);

  async function load() {
    const supabase = createClient();
    const [{ data: cfg }, { data: segs }] = await Promise.all([
      supabase.from("cms_config").select("*").limit(1).single(),
      supabase.from("wheel_segments").select("*").order("position"),
    ]);
    if (cfg) {
      const row = cfg as CmsConfig;
      setConfigId(row.id);
      setWheelEnabled(row.prize_enabled ?? false);
      setScoreThreshold(String(row.spin_threshold ?? 20000));
    }
    setSegments(segs ?? []);
  }

  useEffect(() => { load(); }, []);

  async function saveConfig() {
    if (!configId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("cms_config").update({
      prize_enabled: wheelEnabled,
      spin_threshold: parseInt(scoreThreshold, 10),
      updated_at: new Date().toISOString(),
    }).eq("id", configId);
    setConfigMsg(error ? `Error: ${error.message}` : "Saved ✓");
    setSaving(false);
    setTimeout(() => setConfigMsg(""), 3000);
  }

  function updateSegment(position: number, field: keyof WheelSegment, value: unknown) {
    setSegments(prev => prev.map(s => s.position === position ? { ...s, [field]: value } : s));
  }

  async function saveAllSegments() {
    const supabase = createClient();
    const results = await Promise.all(
      segments.map(s =>
        supabase.from("wheel_segments").update({
          label: s.label, type: s.type, odds: s.odds, enabled: s.enabled,
          discount_pct: s.discount_pct, discount_code: s.discount_code,
          score_value: s.score_value, shopify_url: s.shopify_url,
          result_title: s.result_title, result_desc: s.result_desc, email_body: s.email_body,
        }).eq("position", s.position)
      )
    );
    const err = results.find(r => r.error);
    setSegMsg(err ? `Error: ${err.error!.message}` : "All segments saved ✓");
    setTimeout(() => setSegMsg(""), 3000);
  }

  const activeSegs = segments.filter(s => s.enabled);
  const totalOdds  = activeSegs.reduce((sum, s) => sum + (s.odds ?? 0), 0);
  const oddsOk     = Math.abs(totalOdds - 100) < 0.5;

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={h1}>Wheel of Fortune</h1>
      <p style={muted}>Wheel availability, score threshold, and segment configuration</p>

      {/* Global settings */}
      <section style={{ ...card, marginTop: 24 }}>
        <div style={sectionTitle}>Settings</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
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
              <input
                type="number"
                value={scoreThreshold}
                onChange={e => setScoreThreshold(e.target.value)}
                style={{ width: 160 }}
              />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>points required to spin</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={saveConfig} disabled={saving} style={btnPrimary}>
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {configMsg && (
              <span style={{ fontSize: 13, color: configMsg.startsWith("Error") ? "var(--red)" : "var(--green)" }}>
                {configMsg}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Segments */}
      <section style={{ ...card, marginTop: 20 }}>
        <div style={{ ...rowBetween, marginBottom: 20 }}>
          <div>
            <div style={sectionTitle}>Wheel Segments</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Enabled odds must total 100% —{" "}
              <span style={{ fontWeight: 700, color: oddsOk ? "var(--green)" : "var(--yellow)" }}>
                currently {totalOdds.toFixed(1)}%{oddsOk ? " ✓" : " ⚠"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {segMsg && (
              <span style={{ fontSize: 13, color: segMsg.startsWith("Error") ? "var(--red)" : "var(--green)" }}>
                {segMsg}
              </span>
            )}
            <button onClick={saveAllSegments} style={btnPrimary}>Save All Segments</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {segments.map(seg => {
            const expanded = expandedSeg === seg.position;
            return (
              <div
                key={seg.position}
                style={{ border: `1px solid ${expanded ? "var(--purple)" : "var(--border)"}`, borderRadius: 10, overflow: "hidden", opacity: seg.enabled ? 1 : 0.65 }}
              >
                {/* Header */}
                <div
                  style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 16px", background: "var(--bg-base)", cursor: "pointer" }}
                  onClick={() => setExpandedSeg(expanded ? null : seg.position)}
                >
                  <Toggle value={seg.enabled} onChange={v => updateSegment(seg.position, "enabled", v)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{seg.label || `Segment ${seg.position}`}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {SEGMENT_TYPES.find(t => t.value === seg.type)?.label ?? seg.type} · {seg.odds ?? 0}%
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="range" min={0} max={100} step={0.5}
                      value={seg.odds ?? 0}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); updateSegment(seg.position, "odds", parseFloat(e.target.value)); }}
                      style={{ width: 120, accentColor: "var(--purple)" }}
                    />
                    <input
                      type="number" min={0} max={100} step={0.5}
                      value={seg.odds ?? 0}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); updateSegment(seg.position, "odds", parseFloat(e.target.value) || 0); }}
                      style={{ width: 70, textAlign: "center", fontWeight: 700, color: "var(--purple)" }}
                    />
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ padding: "16px", borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <div style={fieldLabel}>Label (shown on wheel)</div>
                      <input value={seg.label ?? ""} onChange={e => updateSegment(seg.position, "label", e.target.value)} placeholder="e.g. 10% Off" />
                    </div>
                    <div>
                      <div style={fieldLabel}>Type</div>
                      <select value={seg.type ?? ""} onChange={e => updateSegment(seg.position, "type", e.target.value)} style={{ width: "100%" }}>
                        {SEGMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        {!SEGMENT_TYPES.find(t => t.value === seg.type) && seg.type && <option value={seg.type}>{seg.type}</option>}
                      </select>
                    </div>

                    {seg.type === "multiplier" && (
                      <div>
                        <div style={fieldLabel}>Multiplier (e.g. 2 = ×2 points)</div>
                        <input type="number" min={1} step={0.5} value={seg.score_value ?? ""} onChange={e => updateSegment(seg.position, "score_value", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="e.g. 2" />
                      </div>
                    )}
                    {seg.type === "addup" && (
                      <div>
                        <div style={fieldLabel}>Points to Add</div>
                        <input type="number" min={0} value={seg.score_value ?? ""} onChange={e => updateSegment(seg.position, "score_value", e.target.value === "" ? null : parseInt(e.target.value))} placeholder="e.g. 1000" />
                      </div>
                    )}
                    {seg.type === "discount" && <>
                      <div>
                        <div style={fieldLabel}>Discount %</div>
                        <input type="number" min={0} max={100} value={seg.discount_pct ?? ""} onChange={e => updateSegment(seg.position, "discount_pct", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="e.g. 20" />
                      </div>
                      <div>
                        <div style={fieldLabel}>Discount Code</div>
                        <input value={seg.discount_code ?? ""} onChange={e => updateSegment(seg.position, "discount_code", e.target.value || null)} placeholder="e.g. SPIN20" />
                      </div>
                    </>}
                    {seg.type === "shopify" && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={fieldLabel}>Shopify Product URL</div>
                        <input value={seg.shopify_url ?? ""} onChange={e => updateSegment(seg.position, "shopify_url", e.target.value || null)} placeholder="https://returnofthelivingdead.com/..." />
                      </div>
                    )}

                    <div>
                      <div style={fieldLabel}>Result Title</div>
                      <input value={seg.result_title ?? ""} onChange={e => updateSegment(seg.position, "result_title", e.target.value || null)} placeholder="You won 10% off!" />
                    </div>
                    <div>
                      <div style={fieldLabel}>Result Description</div>
                      <input value={seg.result_desc ?? ""} onChange={e => updateSegment(seg.position, "result_desc", e.target.value || null)} placeholder="Use code SPIN10 at checkout" />
                    </div>
                    {seg.type !== "multiplier" && seg.type !== "addup" && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={fieldLabel}>Email Body</div>
                        <textarea rows={3} value={seg.email_body ?? ""} onChange={e => updateSegment(seg.position, "email_body", e.target.value || null)} placeholder="Congrats! Here's your reward…" style={{ resize: "vertical" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={e => { e.stopPropagation(); onChange(!value); }} style={{
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

const h1: React.CSSProperties          = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" };
const muted: React.CSSProperties       = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const card: React.CSSProperties        = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text)" };
const fieldLabel: React.CSSProperties  = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 };
const rowBetween: React.CSSProperties  = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const btnPrimary: React.CSSProperties  = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
