"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WheelSegment, Prize, CmsConfig } from "@/lib/types";

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

function laInputToISO(local: string): string | null {
  if (!local) return null;
  const utcGuess = new Date(local + ":00Z");
  const laShown = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(utcGuess);
  const laDate = new Date(laShown.replace(", ", "T") + ":00Z");
  const diff = utcGuess.getTime() - laDate.getTime();
  return new Date(utcGuess.getTime() + diff).toISOString();
}

const SEGMENT_TYPES = [
  { value: "multiplier",   label: "Multiplier (×points)" },
  { value: "addup",        label: "Add Points (+pts)" },
  { value: "discount",     label: "Discount Code" },
  { value: "shopify",      label: "Shopify / Free Product" },
  { value: "out_of_luck",  label: "No Prize" },
];

export default function GamePage() {
  const [configId, setConfigId] = useState<string | null>(null);
  const [wheelEnabled, setWheelEnabled] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState("20000");
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [expandedSeg, setExpandedSeg] = useState<number | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [configMsg, setConfigMsg] = useState("");
  const [segMsg, setSegMsg] = useState("");
  const [prizeMsgs, setPrizeMsgs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [newPrizeId, setNewPrizeId] = useState<string | null>(null);
  const prizeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function load() {
    const supabase = createClient();
    const [{ data: cfg }, { data: segs }, { data: prs }] = await Promise.all([
      supabase.from("cms_config").select("*").limit(1).single(),
      supabase.from("wheel_segments").select("*").order("position"),
      supabase.from("prizes").select("*").order("created_at"),
    ]);
    if (cfg) {
      const row = cfg as CmsConfig;
      setConfigId(row.id);
      setWheelEnabled(row.prize_enabled ?? false);
      setScoreThreshold(String(row.spin_threshold ?? 20000));
    }
    setSegments(segs ?? []);
    setPrizes(prs ?? []);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!newPrizeId) return;
    const el = prizeRefs.current[newPrizeId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "2px solid var(--purple)";
    el.style.transition = "outline 0.5s";
    setTimeout(() => { el.style.outline = "none"; }, 2000);
    setNewPrizeId(null);
  }, [newPrizeId]);

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
    const updates = segments.map(s =>
      supabase.from("wheel_segments").update({
        label: s.label,
        type: s.type,
        odds: s.odds,
        enabled: s.enabled,
        discount_pct: s.discount_pct,
        discount_code: s.discount_code,
        score_value: s.score_value,
        shopify_url: s.shopify_url,
        result_title: s.result_title,
        result_desc: s.result_desc,
        email_body: s.email_body,
      }).eq("position", s.position)
    );
    const results = await Promise.all(updates);
    const err = results.find(r => r.error);
    setSegMsg(err ? `Error: ${err.error!.message}` : "All segments saved ✓");
    setTimeout(() => setSegMsg(""), 3000);
  }

  async function savePrize(prize: Prize) {
    if (prize.enabled) {
      const conflict = findOverlap(prize, prizes);
      if (conflict) {
        setPrizeMsgs(prev => ({ ...prev, [prize.id]: `Dates overlap with "${conflict.title}" — fix dates first` }));
        setTimeout(() => setPrizeMsgs(prev => { const n = { ...prev }; delete n[prize.id]; return n; }), 4000);
        return;
      }
    }
    const supabase = createClient();
    const { error } = await supabase.from("prizes").update({
      title: prize.title,
      description: prize.description,
      enabled: prize.enabled,
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

  function prizeStatus(prize: Prize): { label: string; color: string; borderColor: string } {
    if (!prize.enabled) return { label: "Disabled", color: "var(--text-muted)", borderColor: "var(--border)" };
    const now = Date.now();
    const start = prize.period_start ? new Date(prize.period_start).getTime() : null;
    const end   = prize.period_end   ? new Date(prize.period_end).getTime()   : null;
    if (start && now < start) return { label: "Scheduled", color: "var(--yellow)", borderColor: "var(--yellow)" };
    if (end && now > end)     return { label: "Ended",     color: "var(--red)",    borderColor: "var(--red)" };
    return                           { label: "Active",    color: "var(--green)",  borderColor: "var(--green)" };
  }

  function findOverlap(candidate: Prize, others: Prize[]): Prize | undefined {
    if (!candidate.period_start) return undefined;
    const aStart = new Date(candidate.period_start).getTime();
    const aEnd = candidate.period_end ? new Date(candidate.period_end).getTime() : Infinity;
    return others.find(p => {
      if (p.id === candidate.id || !p.enabled || !p.period_start) return false;
      const bStart = new Date(p.period_start).getTime();
      const bEnd = p.period_end ? new Date(p.period_end).getTime() : Infinity;
      return aStart < bEnd && aEnd > bStart;
    });
  }

  async function togglePrizeActive(prize: Prize, enabled: boolean) {
    if (enabled) {
      const conflict = findOverlap({ ...prize, enabled: true }, prizes);
      if (conflict) {
        setPrizeMsgs(prev => ({ ...prev, [prize.id]: `Dates overlap with "${conflict.title}" — fix dates first` }));
        setTimeout(() => setPrizeMsgs(prev => { const n = { ...prev }; delete n[prize.id]; return n; }), 4000);
        return;
      }
    }
    updatePrize(prize.id, "enabled", enabled);
    const supabase = createClient();
    const { error } = await supabase.from("prizes").update({ enabled }).eq("id", prize.id);
    if (error) {
      updatePrize(prize.id, "enabled", !enabled);
      setPrizeMsgs(prev => ({ ...prev, [prize.id]: `Error: ${error.message}` }));
      setTimeout(() => setPrizeMsgs(prev => { const n = { ...prev }; delete n[prize.id]; return n; }), 3000);
    }
  }

  async function createPrize() {
    // If an active prize exists, default the new one to start after it ends
    const lastActiveEnd = prizes
      .filter(p => p.enabled && p.period_end)
      .map(p => new Date(p.period_end!).getTime())
      .reduce((max, t) => Math.max(max, t), 0);
    const overlap = prizes.some(p => {
      if (!p.enabled || !p.period_start) return false;
      const now = Date.now();
      const end = p.period_end ? new Date(p.period_end).getTime() : Infinity;
      return now < end;
    });
    if (overlap) {
      alert("An active prize already covers this time period. The new prize will be created starting after it ends — update the dates before enabling.");
    }
    try {
      const supabase = createClient();
      const now = new Date(lastActiveEnd > Date.now() ? lastActiveEnd + 1 : Date.now());
      const monthLater = new Date(now); monthLater.setDate(monthLater.getDate() + 30);
      const { data, error } = await supabase.from("prizes").insert({
        title: "New Prize",
        description: "",
        enabled: false,
        period_start: now.toISOString(),
        period_end: monthLater.toISOString(),
        rank_from: 1,
        rank_to: 1,
      }).select("*");
      if (error) { alert(`Error creating prize: ${error.message}`); return; }
      if (!data || data.length === 0) {
        await load();
        return;
      }
      const created = data[0] as Prize;
      setPrizes(prev => [...prev, created]);
      setNewPrizeId(created.id);
    } catch (e) {
      alert(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function deletePrize(id: string) {
    if (!confirm("Delete this prize?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("prizes").delete().eq("id", id);
    if (error) { alert(`Error: ${error.message}`); return; }
    setPrizes(prev => prev.filter(p => p.id !== id));
  }

  const activeSegments = segments.filter(s => s.enabled);
  const totalOdds = activeSegments.reduce((sum, s) => sum + (s.odds ?? 0), 0);
  const oddsOk = Math.abs(totalOdds - 100) < 0.5;

  return (
    <div style={{ maxWidth: 860 }}>
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

      {/* Segments */}
      <section style={{ ...card, marginTop: 20 }}>
        <div style={{ ...rowBetween, marginBottom: 20 }}>
          <div>
            <div style={sectionTitle}>Wheel Segments</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Enabled odds must total 100% —{" "}
              <span style={{ fontWeight: 700, color: oddsOk ? "var(--green)" : "var(--yellow)" }}>
                currently {totalOdds.toFixed(1)}% {oddsOk ? "✓" : "⚠"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {segMsg && <span style={{ fontSize: 13, color: segMsg.startsWith("Error") ? "var(--red)" : "var(--green)" }}>{segMsg}</span>}
            <button onClick={saveAllSegments} style={btnPrimary}>Save All Segments</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {segments.map(seg => {
            const expanded = expandedSeg === seg.position;
            return (
              <div key={seg.position} style={{ border: `1px solid ${expanded ? "var(--purple)" : "var(--border)"}`, borderRadius: 10, overflow: "hidden", opacity: seg.enabled ? 1 : 0.65 }}>
                {/* Header row */}
                <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 16px", background: "var(--bg-base)", cursor: "pointer" }}
                  onClick={() => setExpandedSeg(expanded ? null : seg.position)}>
                  <Toggle value={seg.enabled} onChange={v => { updateSegment(seg.position, "enabled", v); }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{seg.label || `Segment ${seg.position}`}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{SEGMENT_TYPES.find(t => t.value === seg.type)?.label ?? seg.type} · {seg.odds ?? 0}%</div>
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
                    {/* Always shown */}
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

                    {/* multiplier — score_value is the multiplier factor (e.g. 2 = ×2) */}
                    {seg.type === "multiplier" && (
                      <div>
                        <div style={fieldLabel}>Multiplier (e.g. 2 = ×2 points)</div>
                        <input type="number" min={1} step={0.5} value={seg.score_value ?? ""} onChange={e => updateSegment(seg.position, "score_value", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="e.g. 2" />
                      </div>
                    )}

                    {/* addup — score_value is flat points added */}
                    {seg.type === "addup" && (
                      <div>
                        <div style={fieldLabel}>Points to Add</div>
                        <input type="number" min={0} value={seg.score_value ?? ""} onChange={e => updateSegment(seg.position, "score_value", e.target.value === "" ? null : parseInt(e.target.value))} placeholder="e.g. 1000" />
                      </div>
                    )}

                    {/* discount */}
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

                    {/* shopify / free product */}
                    {seg.type === "shopify" && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={fieldLabel}>Shopify Product URL</div>
                        <input value={seg.shopify_url ?? ""} onChange={e => updateSegment(seg.position, "shopify_url", e.target.value || null)} placeholder="https://returnofthelivingdead.com/..." />
                      </div>
                    )}

                    {/* out_of_luck — no special fields, result copy handles messaging */}

                    {/* Always shown — result copy */}
                    <div>
                      <div style={fieldLabel}>Result Title</div>
                      <input value={seg.result_title ?? ""} onChange={e => updateSegment(seg.position, "result_title", e.target.value || null)} placeholder="You won 10% off!" />
                    </div>
                    <div>
                      <div style={fieldLabel}>Result Description</div>
                      <input value={seg.result_desc ?? ""} onChange={e => updateSegment(seg.position, "result_desc", e.target.value || null)} placeholder="Use code SPIN10 at checkout" />
                    </div>
                    {/* Email body — not applicable for point rewards */}
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

      {/* Prizes */}
      <section style={{ ...card, marginTop: 20 }}>
        <div style={{ ...rowBetween, marginBottom: 24 }}>
          <div style={sectionTitle}>Prizes & Leaderboard Rewards</div>
          <button onClick={createPrize} style={btnPrimary}>+ Add Prize</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {prizes.map(prize => (
            <div key={prize.id} ref={el => { prizeRefs.current[prize.id] = el; }} style={{ border: `1px solid ${prizeStatus(prize).borderColor}`, borderRadius: 10, padding: "20px" }}>
              <div style={{ ...rowBetween, marginBottom: 18 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    value={prize.title ?? ""}
                    onChange={e => updatePrize(prize.id, "title", e.target.value)}
                    style={{ fontWeight: 700, fontSize: 15, border: "none", borderBottom: "1px solid var(--border)", background: "transparent", outline: "none", padding: "2px 4px", color: "var(--text)", width: 240 }}
                    placeholder="Prize title"
                  />
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: prizeStatus(prize).color }}>
                    {prizeStatus(prize).label}
                  </span>
                  <Toggle value={prize.enabled} onChange={v => togglePrizeActive(prize, v)} />
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
                  <div style={fieldLabel}>Period Start <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(LA time)</span></div>
                  <input type="datetime-local" value={isoToLAInput(prize.period_start)} onChange={e => updatePrize(prize.id, "period_start", laInputToISO(e.target.value))} />
                </div>
                <div>
                  <div style={fieldLabel}>Period End <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(blank = ongoing)</span></div>
                  <input type="datetime-local" value={isoToLAInput(prize.period_end)} onChange={e => updatePrize(prize.id, "period_end", laInputToISO(e.target.value) || null as unknown as string)} />
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
                <button onClick={() => savePrize(prize)} style={{ ...btnPrimary, padding: "9px 22px" }}>
                  Save Prize
                </button>
                <button onClick={() => deletePrize(prize.id)} style={{ ...btnSecondary, color: "var(--red)", borderColor: "var(--red)" }}>
                  Delete
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

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 0 };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 };
const rowBetween: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)", borderRadius: 6, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
