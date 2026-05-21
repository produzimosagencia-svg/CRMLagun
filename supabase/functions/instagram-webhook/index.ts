import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN  = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN") ?? "lagun_ig_webhook_2026";
const PAGE_TOKEN    = Deno.env.get("IG_USER_TOKEN") ?? Deno.env.get("IG_PAGE_TOKEN") ?? "";
const IG_ACCOUNT_ID = Deno.env.get("IG_ACCOUNT_ID") ?? "35780017061613318";
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") ?? "";

const SYSTEM_PROMPT = `Você é o assistente virtual da Lagun, uma casa noturna exclusiva em Vitória (ES).
Responda sempre em português, de forma simpática, direta e com o tom sofisticado da marca.

Informações que você conhece:
- Lagun fica na Rua Manoel Gonçalves Carneiro, 65 — Praia do Canto, Vitória/ES
- Horário de funcionamento: sextas e sábados a partir das 23h
- Tem espaço para lounges privativos (até 15 pessoas) com serviço de mordomo
- Para ingressos: acesse o link enviado nas redes ou pergunte sobre o próximo evento
- Para reservar lounge/mesa: WhatsApp (27) 99778-9988
- Instagram: @lagun.vix

Regras:
- Se perguntarem sobre ingressos, informe que há na bio do Instagram ou no link da bio
- Se perguntarem sobre preço de lounge/mesa, direcione para o WhatsApp
- Se for reclamação grave, informe que vai passar para a equipe humana
- Seja breve (máximo 3 linhas por resposta)
- Nunca invente preços ou datas sem ter certeza
- Se não souber algo, diga "não tenho essa informação no momento, mas pode chamar no WhatsApp (27) 99778-9988"`;

async function sendIGReply(recipientId: string, text: string): Promise<boolean> {
  const res = await fetch(
    `https://graph.instagram.com/v19.0/${IG_ACCOUNT_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGE_TOKEN}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
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
    ...history.slice(-6), // last 3 exchanges for context
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

async function getIGUserInfo(igUserId: string): Promise<{ name: string; username: string } | null> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}?fields=name,username&access_token=${PAGE_TOKEN}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  return { name: json.name ?? igUserId, username: json.username ?? "" };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Webhook verification (GET) ──────────────────────────────────────────────
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

  // ── Incoming events (POST) ──────────────────────────────────────────────────
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

        // Skip echoes (messages we sent)
        if (isEcho) continue;

        // Skip if it's a message from our own account
        if (senderId === IG_ACCOUNT_ID) continue;

        const msgText = msg.text ?? "";
        const msgId   = msg.mid ?? null;

        // ── Dedup ────────────────────────────────────────────────────────────
        if (msgId) {
          const { data: existing } = await supabase
            .from("ig_messages")
            .select("id")
            .eq("ig_message_id", msgId)
            .maybeSingle();
          if (existing) continue;
        }

        // ── Upsert conversation ───────────────────────────────────────────────
        let { data: conv } = await supabase
          .from("ig_conversations")
          .select("id, ig_username, ig_name")
          .eq("ig_user_id", senderId)
          .maybeSingle();

        if (!conv) {
          // Fetch user info from IG
          const info = await getIGUserInfo(senderId);
          const { data: newConv } = await supabase
            .from("ig_conversations")
            .insert({
              ig_user_id: senderId,
              ig_name: info?.name ?? senderId,
              ig_username: info?.username ?? "",
              last_message_at: new Date().toISOString(),
              last_message_text: msgText,
              unread_count: 1,
            })
            .select()
            .single();
          conv = newConv;
        } else {
          await supabase
            .from("ig_conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_text: msgText,
              unread_count: supabase.rpc ? undefined : undefined, // handled below
            })
            .eq("ig_user_id", senderId);
        }

        if (!conv) continue;

        // ── Save inbound message ──────────────────────────────────────────────
        await supabase.from("ig_messages").insert({
          conversation_id: conv.id,
          ig_message_id: msgId,
          direction: "inbound",
          text: msgText,
          sent_at: event.timestamp ? new Date(Number(event.timestamp)).toISOString() : new Date().toISOString(),
          is_bot: false,
          read: false,
        });

        // ── Only auto-reply to text messages ─────────────────────────────────
        if (!msgText.trim()) continue;

        // Get last few messages for context
        const { data: historyRows } = await supabase
          .from("ig_messages")
          .select("direction, text")
          .eq("conversation_id", conv.id)
          .order("sent_at", { ascending: false })
          .limit(6);

        const history = (historyRows ?? [])
          .reverse()
          .filter((r: any) => r.text)
          .map((r: any) => ({
            role: r.direction === "inbound" ? "user" : "assistant",
            content: r.text,
          }));

        // ── Generate & send reply ─────────────────────────────────────────────
        const reply = await generateReply(msgText, history);
        const sent  = await sendIGReply(senderId, reply);

        if (sent) {
          await supabase.from("ig_messages").insert({
            conversation_id: conv.id,
            direction: "outbound",
            text: reply,
            sent_at: new Date().toISOString(),
            is_bot: true,
            read: true,
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
