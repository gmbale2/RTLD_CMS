"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PushLog } from "@/lib/types";

const CATEGORIES = [
  { value: "leaderboard", label: "Leaderboard Updates" },
  { value: "prize_wheel", label: "Prize & Wheel" },
  { value: "merch",       label: "Merch Drops" },
  { value: "movie_news",  label: "Movie News & Tarman Today" },
];

const DEEP_LINKS = [
  { value: "",                  label: "No deep link (open app)" },
  { value: "rtld://leaderboard", label: "Leaderboard" },
  { value: "rtld://wheel",       label: "Wheel of Fortune" },
  { value: "rtld://news",        label: "News Feed" },
  { value: "rtld://game",        label: "Game Screen" },
];

export default function PushPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("leaderboard");
  const [deepLink, setDeepLink] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<PushLog[]>([]);

  async function loadLog() {
    const supabase = createClient();
    const { data } = await supabase.from("push_log").select("*").order("sent_at", { ascending: false }).limit(30);
    setLog(data ?? []);
  }

  useEffect(() => { loadLog(); }, []);

  async function sendNotification() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, category, deepLink }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg(`✓ Sent to ${data.count} devices`);
      setTitle(""); setBody(""); setDeepLink("");
      loadLog();
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
    setSending(false);
    setTimeout(() => setMsg(""), 5000);
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={h1}>Push Notifications</h1>
      <p style={muted}>Compose and send to all app users</p>

      <section style={{ ...card, marginTop: 24 }}>
        <div style={sectionTitle}>Compose</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={fieldLabel}>Category</div>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={fieldLabel}>Title</div>
              <span style={{ fontSize: 11, color: title.length > 55 ? "var(--red)" : "var(--text-muted)" }}>{title.length}/65</span>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. This Week's Winner Announced!" maxLength={65} />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={fieldLabel}>Message</div>
              <span style={{ fontSize: 11, color: body.length > 180 ? "var(--red)" : "var(--text-muted)" }}>{body.length}/200</span>
            </div>
            <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="e.g. Check the leaderboard to see if you won the signed poster." maxLength={200} style={{ resize: "vertical" }} />
          </div>

          <div>
            <div style={fieldLabel}>Deep Link</div>
            <select value={deepLink} onChange={e => setDeepLink(e.target.value)}>
              {DEEP_LINKS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {(title || body) && (
            <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Preview</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{title || "Title"}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{body || "Message body"}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={sendNotification} disabled={sending || !title.trim() || !body.trim()}
              style={{ ...btnPrimary, opacity: !title.trim() || !body.trim() ? 0.5 : 1 }}>
              {sending ? "Sending…" : "Send to All Users"}
            </button>
            {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith("Error") ? "var(--red)" : "var(--green)" }}>{msg}</span>}
          </div>
        </div>
      </section>

      <section style={{ ...card, marginTop: 20 }}>
        <div style={sectionTitle}>Delivery Log</div>
        {log.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No notifications sent yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Sent", "Title", "Category", "Deep Link", "Devices"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={cell}>{new Date(entry.sent_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</td>
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{entry.title}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>{entry.body}</div>
                    </td>
                    <td style={cell}>{CATEGORIES.find(c => c.value === entry.category)?.label ?? entry.category}</td>
                    <td style={{ ...cell, color: "var(--text-muted)", fontSize: 11 }}>{entry.deep_link || "—"}</td>
                    <td style={{ ...cell, color: "var(--purple)", fontWeight: 700 }}>{entry.recipient_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 800, margin: 0 };
const muted: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 20 };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const cell: React.CSSProperties = { padding: "10px 14px", verticalAlign: "top" };
