"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Prize } from "@/lib/types";

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
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
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
  return new Date(utcGuess.getTime() + (utcGuess.getTime() - laDate.getTime())).toISOString();
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

export default function LeaderboardPrizesPage() {
  const [prizes, setPrizes]               = useState<Prize[]>([]);
  const [prizeMsgs, setPrizeMsgs]         = useState<Record<string, string>>({});
  const [prizeCreateError, setPrizeCreateError] = useState("");
  const [showOldPrizes, setShowOldPrizes] = useState(false);
  const [newPrizeId, setNewPrizeId]       = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<Record<string, boolean>>({});
  const prizeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("prizes").select("*").order("created_at");
    setPrizes(data ?? []);
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

  function updatePrize(id: string, field: keyof Prize, value: unknown) {
    setPrizes(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  function setMsg(id: string, msg: string) {
    setPrizeMsgs(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => setPrizeMsgs(prev => { const n = { ...prev }; delete n[id]; return n; }), 3500);
  }

  async function savePrize(prize: Prize) {
    if (prize.enabled) {
      const conflict = findOverlap(prize, prizes);
      if (conflict) { setMsg(prize.id, `Dates overlap with "${conflict.title}" — fix dates first`); return; }
    }
    const supabase = createClient();
    const { error } = await supabase.from("prizes").update({
      title: prize.title, description: prize.description,
      enabled: prize.enabled, period_start: prize.period_start, period_end: prize.period_end,
      rank_from: prize.rank_from, rank_to: prize.rank_to,
      shopify_product_url: prize.shopify_product_url, email_body: prize.email_body,
      image_url: prize.image_url,
    }).eq("id", prize.id);
    setMsg(prize.id, error ? `Error: ${error.message}` : "Saved ✓");
  }

  async function togglePrizeActive(prize: Prize, enabled: boolean) {
    if (enabled) {
      const conflict = findOverlap({ ...prize, enabled: true }, prizes);
      if (conflict) { setMsg(prize.id, `Dates overlap with "${conflict.title}" — fix dates first`); return; }
    }
    updatePrize(prize.id, "enabled", enabled);
    const supabase = createClient();
    const { error } = await supabase.from("prizes").update({ enabled }).eq("id", prize.id);
    if (error) {
      updatePrize(prize.id, "enabled", !enabled);
      setMsg(prize.id, `Error: ${error.message}`);
    }
  }

  async function uploadImage(prize: Prize, file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `prize-${prize.id}.${ext}`;
    setUploadingImage(prev => ({ ...prev, [prize.id]: true }));
    try {
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from("prize-images").upload(path, file, { upsert: true });
      if (upErr) { setMsg(prize.id, `Upload error: ${upErr.message}`); return; }
      const { data: urlData } = supabase.storage.from("prize-images").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      updatePrize(prize.id, "image_url", publicUrl);
      const { error: dbErr } = await supabase.from("prizes").update({ image_url: publicUrl }).eq("id", prize.id);
      setMsg(prize.id, dbErr ? `DB error: ${dbErr.message}` : "Image uploaded ✓");
    } finally {
      setUploadingImage(prev => ({ ...prev, [prize.id]: false }));
    }
  }

  async function removeImage(prize: Prize) {
    updatePrize(prize.id, "image_url", null);
    const supabase = createClient();
    const { error } = await supabase.from("prizes").update({ image_url: null }).eq("id", prize.id);
    setMsg(prize.id, error ? `Error: ${error.message}` : "Image removed ✓");
  }

  async function createPrize() {
    const lastActiveEnd = prizes
      .filter(p => p.enabled && p.period_end)
      .map(p => new Date(p.period_end!).getTime())
      .reduce((max, t) => Math.max(max, t), 0);
    const hasActiveCoverage = prizes.some(p => {
      if (!p.enabled || !p.period_start) return false;
      const end = p.period_end ? new Date(p.period_end).getTime() : Infinity;
      return Date.now() < end;
    });
    setPrizeCreateError(hasActiveCoverage
      ? "Error: An active prize already covers this period. The new prize will start after it ends — update the dates before enabling it."
      : "");
    try {
      const supabase = createClient();
      const now = new Date(lastActiveEnd > Date.now() ? lastActiveEnd + 1 : Date.now());
      const monthLater = new Date(now); monthLater.setDate(monthLater.getDate() + 30);
      const { data, error } = await supabase.from("prizes").insert({
        title: "New Prize", description: "", enabled: false,
        period_start: now.toISOString(), period_end: monthLater.toISOString(),
        rank_from: 1, rank_to: 1,
      }).select("*");
      if (error) { alert(`Error: ${error.message}`); return; }
      if (!data || data.length === 0) { await load(); return; }
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

  const statusOrder = (p: Prize) => prizeStatus(p).label === "Active" ? 0 : 1;
  const byStatusThenStart = (a: Prize, b: Prize) =>
    statusOrder(a) - statusOrder(b) ||
    new Date(b.period_start ?? 0).getTime() - new Date(a.period_start ?? 0).getTime();
  const byStartDesc = (a: Prize, b: Prize) =>
    new Date(b.period_start ?? 0).getTime() - new Date(a.period_start ?? 0).getTime();

  const current = prizes
    .filter(p => { const s = prizeStatus(p).label; return s === "Active" || s === "Scheduled"; })
    .sort(byStatusThenStart);
  const older = prizes
    .filter(p => { const s = prizeStatus(p).label; return s === "Ended" || s === "Disabled"; })
    .sort(byStartDesc);

  function PrizeCard({ prize, dimmed = false }: { prize: Prize; dimmed?: boolean }) {
    return (
      <div
        ref={el => { prizeRefs.current[prize.id] = el; }}
        style={{ border: `1px solid ${prizeStatus(prize).borderColor}`, borderRadius: 10, padding: "20px", opacity: dimmed ? 0.7 : 1 }}
      >
        <div style={{ ...rowBetween, marginBottom: 18 }}>
          <input
            value={prize.title ?? ""}
            onChange={e => updatePrize(prize.id, "title", e.target.value)}
            style={{ fontWeight: 700, fontSize: 15, border: "none", borderBottom: "1px solid var(--border)", background: "transparent", outline: "none", padding: "2px 4px", color: "var(--text)", width: 260 }}
            placeholder="Prize title"
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: prizeStatus(prize).color }}>{prizeStatus(prize).label}</span>
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

        {!dimmed && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={fieldLabel}>Prize Image</div>
            {prize.image_url ? (
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 10 }}>
                <img src={prize.image_url} alt="Prize" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", wordBreak: "break-all" }}>
                    {prize.image_url.split("/").pop()}
                  </span>
                  <label style={{ ...btnSecondary, display: "inline-block", cursor: "pointer", textAlign: "center", padding: "7px 14px" }}>
                    Replace image
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(prize, f); e.target.value = ""; }}
                      disabled={uploadingImage[prize.id]} />
                  </label>
                  <button onClick={() => removeImage(prize)} style={{ ...btnSecondary, color: "var(--red)", borderColor: "var(--red)", padding: "7px 14px" }}>
                    Remove image
                  </button>
                </div>
              </div>
            ) : (
              <label style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
                {uploadingImage[prize.id] ? "Uploading…" : "📁 Upload image"}
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(prize, f); e.target.value = ""; }}
                  disabled={uploadingImage[prize.id]} />
              </label>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 16 }}>
          <button onClick={() => savePrize(prize)} style={{ ...btnPrimary, padding: "9px 22px" }}>Save Prize</button>
          <button onClick={() => deletePrize(prize.id)} style={{ ...btnSecondary, color: "var(--red)", borderColor: "var(--red)" }}>Delete</button>
          {prizeMsgs[prize.id] && (
            <span style={{ fontSize: 13, color: prizeMsgs[prize.id].startsWith("Error") ? "var(--red)" : "var(--green)" }}>
              {prizeMsgs[prize.id]}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={h1}>Leaderboard Prizes</h1>
          <p style={muted}>Prizes awarded to top-ranked players at the end of each competition period</p>
        </div>
        <button onClick={createPrize} style={btnPrimary}>+ Add Prize</button>
      </div>

      {prizeCreateError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "14px 18px", marginBottom: 20, color: "var(--red)", fontSize: 15, fontWeight: 700 }}>
          {prizeCreateError}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {current.length === 0 && older.length === 0 && (
          <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
            <p style={{ fontSize: 32, margin: "0 0 12px" }}>🏆</p>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No prizes yet. Click <strong>+ Add Prize</strong> to create the first one.</p>
          </div>
        )}

        {current.map(prize => <PrizeCard key={prize.id} prize={prize} />)}

        {older.length > 0 && (
          <div>
            <button
              onClick={() => setShowOldPrizes(p => !p)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--purple)", fontSize: 13, fontWeight: 600, padding: "6px 0", display: "flex", alignItems: "center", gap: 6 }}
            >
              {showOldPrizes ? "▾ Hide" : "▸ Show"} older / inactive ({older.length})
            </button>
            {showOldPrizes && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
                {older.map(prize => <PrizeCard key={prize.id} prize={prize} dimmed />)}
              </div>
            )}
          </div>
        )}
      </div>
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

const h1: React.CSSProperties         = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" };
const muted: React.CSSProperties      = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const card: React.CSSProperties       = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 };
const rowBetween: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const btnPrimary: React.CSSProperties  = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-muted)", borderRadius: 6, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
