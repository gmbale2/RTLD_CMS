"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PushLog } from "@/lib/types";

const CATEGORIES = [
  { value: "leaderboard",   label: "Leaderboard Updates" },
  { value: "prize_wheel",   label: "Prize & Wheel" },
  { value: "merch",         label: "Merch Drops" },
  { value: "movie_news",    label: "Movie News & Tarman Today" },
];

const DEEP_LINKS = [
  { value: "",              label: "No deep link (open app)" },
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
  const [log, setLog] = useState<PushLog[]>([]);
  const [msg, setMsg] = useState("");

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
      setMsg(`Sent to ${data.count} devices`);
      setTitle(""); setBody(""); setDeepLink("");
      loadLog();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setMsg(`Error: ${message}`);
    }
    setSending(false);
    setTimeout(() => setMsg(""), 4000);
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Push Notifications</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>Compose and send to all app users</p>

      <section style={card}>
        <h2 style={sectionTitle}>Compose</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={fieldLabel}>Category</div>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <div style={fieldLabel}>Title</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. This Week's Winner Announced!" maxLength={65} />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{title.length}/65</div>
          </div>

          <div>
            <div style={fieldLabel}>Message</div>
            <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="e.g. Check the leaderboard to see if you won the signed poster." maxLength={200} style={{ resize: "vertical" }} />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{body.length}/200</div>
          </div>

          <div>
            <div style={fieldLabel}>Deep Link</div>
            <select value={deepLink} onChange={e => setDeepLink(e.target.value)}>
              {DEEP_LINKS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {/* Preview */}
          {(title || body) && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>PREVIEW</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{title || "Title"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{body || "Message body"}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button onClick={sendNotification} disabled={sending || !title.trim() || !body.trim()} style={{ ...btnPrimary, opacity: !title.trim() || !body.trim() ? 0.5 : 1 }}>
              {sending ? "Sending…" : "Send to All Users"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.startsWith("Error") ? "#ff4444" : "var(--green)" }}>{msg}</span>}
          </div>
        </div>
      </section>

      {/* Delivery Log */}
      <section style={{ ...card, marginTop: 24 }}>
        <h2 style={sectionTitle}>Delivery Log</h2>
        {log.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No notifications sent yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Sent", "Title", "Category", "Devices"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, letterSpacing: 1, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map(entry => (
                <tr key={entry.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={cell}>{new Date(entry.sent_at).toLocaleString()}</td>
                  <td style={cell}>
                    <div style={{ fontWeight: 600 }}>{entry.title}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{entry.body}</div>
                  </td>
                  <td style={cell}>{CATEGORIES.find(c => c.value === entry.category)?.label ?? entry.category}</td>
                  <td style={{ ...cell, color: "var(--green)", fontWeight: 700 }}>{entry.recipient_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 20 };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 6 };
const btnPrimary: React.CSSProperties = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const cell: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
