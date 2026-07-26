import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { title, body, category, deepLink } = await request.json();

  if (!title || !body) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Get all push tokens
  const { data: tokens, error: tokenErr } = await supabase
    .from("user_push_tokens")
    .select("token")
    .not("token", "is", null);

  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }

  const pushTokens = (tokens ?? []).map(t => t.token).filter(Boolean);

  // Send via Expo Push API in batches of 100
  const messages = pushTokens.map(token => ({
    to: token,
    title,
    body,
    data: { category, deepLink: deepLink || undefined },
    sound: "default",
  }));

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(batch),
      });
      sent += batch.length;
    } catch {}
  }

  // Log to push_log
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("push_log").insert({
    title,
    body,
    category,
    deep_link: deepLink || null,
    sent_by: user?.id ?? null,
    recipient_count: sent,
  });

  return NextResponse.json({ count: sent });
}
