import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_API = "https://graph.facebook.com/v21.0";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return `5527${digits}`;
}

async function sendWhatsAppTemplate(
  phoneNumberId: string,
  templateName: string,
  templateLanguage: string,
  to: string,
  name: string,
  token: string
): Promise<{ ok: boolean; wamid?: string; error?: string }> {
  const resp = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: formatPhone(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage || "pt_BR" },
        // Só inclui components se o template tiver variável {{1}} no nome
        // Templates sem variáveis (ex: carrinho_aura) não devem receber components
        ...(name?.trim()
          ? {
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: name.trim() }],
                },
              ],
            }
          : {}),
      },
    }),
  });
  const data = await resp.json();
  if (data.error) return { ok: false, error: data.error.message };
  return { ok: true, wamid: data.messages?.[0]?.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let payload: any;

    if (req.method === "POST" || req.method === "PUT") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = await req.json();
      } else if (contentType.includes("form")) {
        const formData = await req.formData();
        payload = Object.fromEntries(formData.entries());
      } else {
        payload = { raw: await req.text() };
      }
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      payload = Object.fromEntries(url.searchParams.entries());
    } else {
      payload = { method: req.method };
    }

    const logEntry = {
      payload,
      headers: Object.fromEntries(req.headers.entries()),
      method: req.method,
      timestamp: new Date().toISOString(),
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Salva o log
    const { error: logError } = await supabase.from("webhook_logs").insert({
      source: "blueticket",
      payload: logEntry,
    });
    if (logError) console.error("Error saving webhook log:", logError);

    // ── Auto-disparo WhatsApp para carrinho abandonado ──────────────────────
    const eventType = payload?.type;
    const eventId = String(payload?.event?.id || "");
    const customer = payload?.customer || payload?.order?.customer;

    if (eventType === "abandoned_cart" && eventId && customer?.phone) {
      const { data: config } = await supabase
        .from("bt_auto_dispatch")
        .select("*")
        .eq("event_id", eventId)
        .eq("enabled", true)
        .maybeSingle();

      if (config?.phone_number_id && config?.template_name) {
        const token = Deno.env.get("META_WHATSAPP_TOKEN") || "";
        // Só passa o nome como variável se o template tiver {{1}} (template_variable_count >= 1)
        const nameForTemplate = (config.template_variable_count ?? 0) >= 1 ? (customer.name || "") : "";
        const result = await sendWhatsAppTemplate(
          config.phone_number_id,
          config.template_name,
          config.template_language || "pt_BR",
          customer.phone,
          nameForTemplate,
          token
        );

        if (result.ok) {
          // Salva a mensagem enviada no histórico
          await supabase.from("whatsapp_messages").insert({
            phone: formatPhone(customer.phone),
            contact_name: customer.name || null,
            direction: "outgoing",
            message_type: "template",
            message_text: `[Auto-disparo] Template: ${config.template_name}`,
            status: "sent",
            wamid: result.wamid || null,
          });
          console.log(`Auto-disparo enviado para ${customer.phone} (${customer.name})`);
        } else {
          console.error(`Erro no auto-disparo para ${customer.phone}:`, result.error);
        }
      }
    }

    console.log("Blueticket webhook received:", JSON.stringify(logEntry).slice(0, 500));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
