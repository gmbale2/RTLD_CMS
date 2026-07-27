"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Post {
  id: string;
  section: string;
  title: string;
  body: string | null;
  vimeo_url: string | null;
  published_at: string;
  status: "draft" | "published";
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function vimeoId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:vimeo\.com\/)(\d+)/);
  return m ? m[1] : null;
}

export default function MovieUpdatesPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [newPostId, setNewPostId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("content_posts")
      .select("*")
      .eq("section", "movie_updates")
      .order("published_at", { ascending: false });
    if (!error) setPosts((data ?? []) as Post[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!newPostId) return;
    const el = cardRefs.current[newPostId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "2px solid var(--purple)";
    el.style.transition = "outline 0.5s";
    setTimeout(() => { el.style.outline = "none"; }, 2000);
    setNewPostId(null);
  }, [newPostId]);

  function update(id: string, field: keyof Post, value: unknown) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  function setMsg(id: string, msg: string) {
    setMsgs(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => setMsgs(prev => { const n = { ...prev }; delete n[id]; return n; }), 3000);
  }

  async function create() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("content_posts")
      .insert({
        section: "movie_updates",
        title: "New Post",
        body: "",
        vimeo_url: "",
        status: "draft",
        published_at: new Date().toISOString(),
      })
      .select("*");
    if (error) { alert(`Error: ${error.message}`); return; }
    if (!data || data.length === 0) { await load(); return; }
    const created = data[0] as Post;
    setPosts(prev => [created, ...prev]);
    setNewPostId(created.id);
  }

  async function save(post: Post) {
    const supabase = createClient();
    const { error } = await supabase
      .from("content_posts")
      .update({
        title: post.title,
        body: post.body,
        vimeo_url: post.vimeo_url || null,
        status: post.status,
        published_at: post.published_at,
      })
      .eq("id", post.id);
    setMsg(post.id, error ? `Error: ${error.message}` : "Saved");
  }

  async function remove(id: string) {
    if (!confirm("Delete this post?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("content_posts").delete().eq("id", id);
    if (error) { alert(`Error: ${error.message}`); return; }
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  const published = posts.filter(p => p.status === "published");
  const drafts    = posts.filter(p => p.status === "draft");

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={h1}>Movie Updates</h1>
          <p style={muted}>{published.length} published · {drafts.length} draft</p>
        </div>
        <button onClick={create} style={btnPrimary}>+ Add Post</button>
      </div>

      {loading ? (
        <p style={muted}>Loading…</p>
      ) : posts.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
          <p style={{ fontSize: 32, margin: "0 0 12px" }}>🎬</p>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No posts yet. Click <strong>+ Add Post</strong> to create the first one.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {posts.map(post => {
            const vid = vimeoId(post.vimeo_url);
            return (
              <div
                key={post.id}
                ref={el => { cardRefs.current[post.id] = el; }}
                style={{ ...card, borderColor: post.status === "published" ? "var(--green)" : "var(--border)" }}
              >
                {/* Status badge + toggle */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 1,
                    color: post.status === "published" ? "var(--green)" : "var(--text-muted)",
                  }}>
                    {post.status === "published" ? "● PUBLISHED" : "○ DRAFT"}
                  </span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      onClick={() => update(post.id, "status", post.status === "published" ? "draft" : "published")}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6, cursor: "pointer",
                        background: post.status === "published" ? "transparent" : "var(--purple)",
                        color: post.status === "published" ? "var(--text-muted)" : "#fff",
                        border: post.status === "published" ? "1px solid var(--border-strong)" : "none",
                      }}
                    >
                      {post.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <button onClick={() => remove(post.id)} style={{ ...btnDanger }}>Delete</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: vid ? "1fr 160px" : "1fr", gap: 20, alignItems: "start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Title */}
                    <div>
                      <div style={fieldLabel}>Title</div>
                      <input
                        value={post.title}
                        onChange={e => update(post.id, "title", e.target.value)}
                        style={{ width: "100%", fontWeight: 700, fontSize: 15 }}
                        placeholder="Post title"
                      />
                    </div>

                    {/* Excerpt */}
                    <div>
                      <div style={fieldLabel}>Excerpt</div>
                      <textarea
                        rows={3}
                        value={post.body ?? ""}
                        onChange={e => update(post.id, "body", e.target.value)}
                        placeholder="Short description shown under the title in the app…"
                        style={{ resize: "vertical", width: "100%" }}
                      />
                    </div>

                    {/* Vimeo URL */}
                    <div>
                      <div style={fieldLabel}>Vimeo URL</div>
                      <input
                        value={post.vimeo_url ?? ""}
                        onChange={e => update(post.id, "vimeo_url", e.target.value)}
                        placeholder="https://vimeo.com/123456789"
                        style={{ width: "100%" }}
                      />
                      {post.vimeo_url && !vid && (
                        <p style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>
                          Couldn't parse a Vimeo video ID from this URL — double-check the link.
                        </p>
                      )}
                    </div>

                    {/* Publish date */}
                    <div>
                      <div style={fieldLabel}>Publish Date</div>
                      <input
                        type="datetime-local"
                        value={post.published_at ? post.published_at.slice(0, 16) : ""}
                        onChange={e => update(post.id, "published_at", new Date(e.target.value).toISOString())}
                      />
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Controls sort order in the app (newest first). Defaults to now.
                      </p>
                    </div>
                  </div>

                  {/* Vimeo thumbnail preview */}
                  {vid && (
                    <div>
                      <div style={fieldLabel}>Preview</div>
                      <img
                        src={`https://vumbnail.com/${vid}.jpg`}
                        alt="Vimeo thumbnail"
                        style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <a
                        href={post.vimeo_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: "var(--purple)", marginTop: 6, display: "block" }}
                      >
                        Open on Vimeo ↗
                      </a>
                    </div>
                  )}
                </div>

                {/* Save row */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18 }}>
                  <button onClick={() => save(post)} style={{ ...btnPrimary, padding: "9px 22px" }}>Save</button>
                  {msgs[post.id] && (
                    <span style={{ fontSize: 13, color: msgs[post.id].startsWith("Error") ? "var(--red)" : "var(--green)" }}>
                      {msgs[post.id]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const h1: React.CSSProperties         = { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text)" };
const muted: React.CSSProperties      = { color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" };
const card: React.CSSProperties       = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px" };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 6 };
const btnPrimary: React.CSSProperties  = { background: "var(--purple)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnDanger: React.CSSProperties   = { background: "transparent", border: "1px solid var(--red)", color: "var(--red)", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
