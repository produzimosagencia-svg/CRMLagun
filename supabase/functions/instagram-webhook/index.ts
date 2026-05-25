import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN") ?? "lagun_ig_webhook_2026";
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") ?? "";

// Map IG account IDs → token secret names (same as instagram-api)
const IG_DM_TOKEN_MAP: Record<string, string> = {
  "17841412165311222": "META_IG_DM_TOKEN",          // @triade.ent
  "17841464788107057": "META_IG_DM_TOKEN_MAESTRIA",  // @maestria.rap
  "17841436376156784": "META_IG_DM_TOKEN_LAGUN",    // @lagunvix
};

// Map IG IDs → Facebook Page IDs
const IG_TO_PAGE_MAP: Record<string, string> = {
  "17841436376156784": "1041049812431226", // @lagunvix → Lagun page
};

async function getPageAccessToken(pageId: string, systemUserToken: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${systemUserToken}`
    );
    const data = await resp.json();
    return data.access_token ?? null;
  } catch { return null; }
}

const IG_USERNAME_MAP: Record<string, string> = {
  "17841412165311222": "triade.ent",
  "17841464788107057": "maestria.rap",
  "17841436376156784": "lagunvix",
};

function getTokenForAccount(recipientId: string): string {
  const secretName = IG_DM_TOKEN_MAP[recipientId];
  if (secretName) {
    const token = Deno.env.get(secretName);
    if (token) return token.trim();
  }
  // Fallback to default
  return (Deno.env.get("META_IG_DM_TOKEN") ?? "").trim();
}

const SYSTEM_PROMPT = `Você é o assistente virtual da Lagun, uma casa noturna exclusiva em Vitória (ES).
Responda sempre em português, de forma simpática, direta e com o tom sofisticado da marca.

Informações que você conhece:
- Lagun fica na Rua Manoel Gonçalves Carneiro, 65 — Praia do Canto, Vitória/ES
- Horário de funcionamento: sextas e sábados a partir das 23h
- Tem espaço para lounges privativos (até 15 pessoas) com serviço de mordomo
- Para ingressos: acesse o link enviado nas redes ou pergunte sobre o próximo evento
- Para reservar lounge/mesa: WhatsApp (27) 99778-9988
- Instagram: @lagunvix

Regras:
- Se perguntarem sobre ingressos, informe que há na bio do Instagram ou no link da bio
- Se perguntarem sobre preço de lounge/mesa, direcione para o WhatsApp
- Se for reclamação grave, informe que vai passar para a equipe humana
- Seja breve (máximo 3 linhas por resposta)
- Nunca invente preços ou datas sem ter certeza
- Se não souber algo, diga "não tenho essa informação no momento, mas pode chamar no WhatsApp (27) 99778-9988"`;

async function sendIGReply(recipientId: string, senderId: string, text: string, token: string): Promise<boolean> {
  // Use Page ID + Page Access Token for Messenger API
  const pageId = IG_TO_PAGE_MAP[recipientId];
  let sendToken = token;
  let apiSenderId = pageId ?? recipientId;
  if (pageId) {
    const pageToken = await getPageAccessToken(pageId, token);
    if (pageToken) sendToken = pageToken;
  }
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${apiSenderId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: senderId },
        message: { text },
        messaging_type: "RESPONSE",
        access_token: sendToken,
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    console.error("IG send error:", JSON.stringify(json));
    return false;
  }
  return true;
}

async function generateReply(userMessage: string, history: { role: string; content: string }[]): Promise<string> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-6),
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "Oi! Para mais informações, fala com a gente no WhatsApp (27) 99778-9988 😊";
}

async function getIGUserInfo(
  senderId: string,
  recipientId: string,
  token: string
): Promise<{ name: string; username: string } | null> {
  try {
    // Use graph.facebook.com — System User tokens (EAA...) work here
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${recipientId}/conversations?platform=instagram&user_id=${senderId}&fields=participants&access_token=${token}`
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("getIGUserInfo error:", err);
      return null;
    }
    const json = await res.json();
    const participants: any[] = json.data?.[0]?.participants?.data ?? [];
    // Find participant that is NOT our account
    const sender = participants.find((p: any) => p.id !== recipientId && p.username !== 'lagunvix');
    if (sender) {
      return {
        name: sender.name ?? sender.username ?? senderId,
        username: sender.username ?? sender.name ?? senderId,
      };
    }
    return null;
  } catch (e) {
    console.error("getIGUserInfo exception:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Webhook verification (GET) ───────────────────────────────────────────
  if (req.method === "GET") {
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified ✓");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── Incoming events (POST) ───────────────────────────────────────────────
  if (req.method === "POST") {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any;
    try { body = await req.json(); } catch { return new Response("ok", { status: 200 }); }

    const entries = body?.entry ?? [];

    for (const entry of entries) {
      const events = entry.messaging ?? [];

      for (const event of events) {
        const senderId    = event.sender?.id as string;
        const recipientId = event.recipient?.id as string;
        if (!senderId || !event.message) continue;

        const msg    = event.message;
        const isEcho = msg.is_echo === true;

        // Skip echoes and messages from our own account
        if (isEcho) continue;
        if (senderId === recipientId) continue;

        const msgText = msg.text ?? "";
        const msgId   = msg.mid ?? null;
        const token   = getTokenForAccount(recipientId);
        const igUsername = IG_USERNAME_MAP[recipientId] ?? "instagram";

        // ── Dedup ──────────────────────────────────────────────────────────
        if (msgId) {
          const { data: existing } = await supabase
            .from("whatsapp_messages")
            .select("id")
            .eq("wamid", msgId)
            .eq("channel", "instagram")
            .maybeSingle();
          if (existing) continue;
        }

        // ── Fetch sender info ──────────────────────────────────────────────
        const userInfo = await getIGUserInfo(senderId, recipientId, token);
        const contactName = userInfo?.username
          ? userInfo.username
          : (userInfo?.name ?? senderId);

        // ── Save inbound message to whatsapp_messages ──────────────────────
        await supabase.from("whatsapp_messages").insert({
          phone: senderId,
          contact_name: contactName,
          direction: "incoming",
          message_type: msgText ? "text" : (msg.attachments?.[0]?.type ?? "attachment"),
          message_text: msgText || null,
          media_url: msg.attachments?.[0]?.payload?.url ?? null,
          timestamp: event.timestamp
            ? new Date(Number(event.timestamp)).toISOString()
            : new Date().toISOString(),
          status: null,
          wamid: msgId,
          channel: "instagram",
        });

        console.log(`IG msg from ${contactName} (${senderId}) → @${igUsername}: "${msgText.slice(0, 60)}"`);

        // ── Only auto-reply to text messages ───────────────────────────────
        if (!msgText.trim()) continue;
        if (!OPENAI_KEY) continue;

        // Get history for context
        const { data: historyRows } = await supabase
          .from("whatsapp_messages")
          .select("direction, message_text")
          .eq("phone", senderId)
          .eq("channel", "instagram")
          .order("timestamp", { ascending: false })
          .limit(6);

        const history = (historyRows ?? [])
          .reverse()
          .filter((r: any) => r.message_text)
          .map((r: any) => ({
            role: r.direction === "incoming" ? "user" : "assistant",
            content: r.message_text,
          }));

        // ── Generate & send reply ──────────────────────────────────────────
        const reply = await generateReply(msgText, history);
        const sent  = await sendIGReply(recipientId, senderId, reply, token);

        if (sent) {
          await supabase.from("whatsapp_messages").insert({
            phone: senderId,
            contact_name: contactName,
            direction: "outgoing",
            message_type: "text",
            message_text: reply,
            media_url: null,
            timestamp: new Date().toISOString(),
            status: "sent",
            wamid: null,
            channel: "instagram",
          });
          console.log(`Auto-reply sent to ${senderId}: ${reply.slice(0, 60)}…`);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
});
