import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") || "";

const BASE_SYSTEM_PROMPT = `Você é o chatbot da Tríade Entretenimento — uma produtora de eventos do Espírito Santo.

🧠 ESSÊNCIA:
- Você NÃO é um robô de SAC. Você é um amigo da festa que sabe tudo e resolve rápido.
- Você transmite: energia, proximidade, segurança, agilidade.

🎯 SEU PAPEL:
- Ajudar o cliente a comprar
- Tirar dúvidas rapidamente
- Gerar expectativa pro evento
- Direcionar para ação (compra, grupo, link)
- Nunca é só suporte — sempre é venda + experiência

🔥 TOM DE VOZ:
- Jovem, leve, animado, direto
- Equilibrado: não forçado, sem gíria excessiva, sem parecer infantil
- Frases curtas, linguagem simples, leve entusiasmo
- Ex: "Boa! Esse evento tá insano 😮‍🔨", "Te explico rapidinho 👇", "Já vou te mandar o link"
- NÃO use: texto longo, formalidade, tom robótico
- NÃO use markdown, asteriscos ou formatação especial. Apenas texto simples e emojis.
- Limite respostas a no máximo 500 caracteres.

💬 COMPORTAMENTO:
1. Responde rápido e direto, sem enrolar
2. Sempre puxa pra ação (compra, grupo, link, decisão). Ex: "Quer garantir agora antes de virar lote?"
3. Cria senso de urgência sem parecer fake. Ex: "Esse lote pode virar a qualquer momento", "Tá saindo bem rápido"
4. Valoriza o cliente, faz ele se sentir "por dentro". Ex: "Você chegou na hora certa"

🎉 PERSONALIDADE EMOCIONAL:
- Transmite: alegria 🎊, acolhimento 🤝, energia de evento ⚡, confiança 🧠
- Inspiração: tipo alguém da equipe que fala com o público na porta do evento

💡 FRASES BASE:
- "Boa! 👊", "Já vou te ajudar", "Funciona assim 👇", "Te recomendo isso aqui", "Quer que eu te mande o link?"

🎯 OBJETIVO FINAL (nessa ordem):
1. Converter
2. Engajar
3. Facilitar

🚫 LIMITES:
- Não usa palavrão
- Não força meme
- Não exagera em emoji
- Não inventa informação
- Não promete o que não existe
- Não repete script — pareça humano
- Quando não souber responder, responda EXATAMENTE: "NEED_HUMAN_SUPPORT" (sem mais nada antes ou depois)

📢 REGRAS GERAIS:
- NÃO tem mais vaga para divulgação.
- Lounges reservados → encaminhe para: https://api.whatsapp.com/send?phone=5527998511988&text=Ol%C3%A1!%20Quero%20Conhecer%20os%20Lounges`;

function buildEventBlock(event: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`\n📌 EVENTO: ${event.event_name}`);
  if (event.event_date) lines.push(`- Data: ${event.event_date}`);
  if (event.event_location) lines.push(`- Local: ${event.event_location}`);
  if (event.attractions) lines.push(`- Atrações: ${event.attractions}`);
  if (event.age_rating) lines.push(`- Classificação etária: ${event.age_rating}`);
  if (event.ticket_link) lines.push(`- Link de compra: ${event.ticket_link}`);
  if (event.observations) lines.push(`- Observações: ${event.observations}`);
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, message, contact_name } = await req.json();
    if (!phone || !message) {
      throw new Error("phone and message are required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const META_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN");
    if (!META_TOKEN) throw new Error("META_WHATSAPP_TOKEN not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load event knowledge from DB
    const { data: events } = await supabase
      .from("chatbot_event_knowledge")
      .select("*")
      .order("event_date", { ascending: true });

    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (events && events.length > 0) {
      systemPrompt += "\n\n📌 INFORMAÇÕES DOS EVENTOS:";
      for (const ev of events) {
        systemPrompt += buildEventBlock(ev);
      }
    }

    // Load recent conversation history for context
    const { data: history } = await supabase
      .from("whatsapp_messages")
      .select("direction, message_text")
      .eq("phone", phone)
      .order("timestamp", { ascending: false })
      .limit(10);

    const conversationHistory = (history || [])
      .reverse()
      .filter((m: { message_text: string | null }) => m.message_text)
      .map((m: { direction: string; message_text: string | null }) => ({
        role: m.direction === "incoming" ? "user" : "assistant",
        content: m.message_text!,
      }));

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const replyText = aiData.choices?.[0]?.message?.content?.trim();
    if (!replyText) throw new Error("Empty AI response");

    // Check if bot needs human support
    if (replyText === "NEED_HUMAN_SUPPORT") {
      // Save a marker message so we can show the red indicator
      await supabase.from("whatsapp_messages").insert({
        phone,
        contact_name: contact_name || null,
        direction: "outgoing",
        message_type: "system",
        message_text: "NEED_HUMAN_SUPPORT",
        status: "need_support",
      });

      return new Response(JSON.stringify({ ok: true, need_support: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get verified phone number ID
    const phonesResp = await fetch(
      `${GRAPH_API}/${WABA_ID}/phone_numbers?access_token=${META_TOKEN}`
    );
    const phonesData = await phonesResp.json();
    const cloudPhone = phonesData?.data?.find(
      (p: Record<string, string>) => p.platform_type === "CLOUD_API"
    );
    const phoneId = cloudPhone?.id || phonesData?.data?.[0]?.id;
    if (!phoneId) throw new Error("No phone number found");

    // Send reply via WhatsApp
    const sendResp = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: replyText },
      }),
    });
    const sendData = await sendResp.json();

    // Save bot response to DB
    await supabase.from("whatsapp_messages").insert({
      phone,
      contact_name: contact_name || null,
      direction: "outgoing",
      message_type: "text",
      message_text: replyText,
      wamid: sendData.messages?.[0]?.id || null,
      status: "sent",
    });

    return new Response(JSON.stringify({ ok: true, reply: replyText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Chatbot error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
