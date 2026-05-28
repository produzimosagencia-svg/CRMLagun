import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") || "1169322241814706";

type TemplateComponent = {
  type?: string;
  text?: string;
};

type Contact = {
  name?: string;
  phone: string;
};

const countTemplateVariables = (components: TemplateComponent[] = []) => {
  return components.reduce((maxCount, component) => {
    if (typeof component.text !== "string") return maxCount;

    const matches = [...component.text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    if (matches.length === 0) return maxCount;

    return Math.max(maxCount, ...matches);
  }, 0);
};

const buildTemplateComponents = (contact: Contact, variableCount: number) => {
  if (variableCount <= 0) return undefined;

  return [
    {
      type: "body",
      parameters: Array.from({ length: variableCount }, (_, index) => ({
        type: "text",
        text: index === 0 ? contact.name?.trim() || "cliente" : "-",
      })),
    },
  ];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "META_WHATSAPP_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    let result: unknown;

    switch (action) {
      case "phone_numbers": {
        const resp = await fetch(
          `${GRAPH_API}/${WABA_ID}/phone_numbers?access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "templates": {
        const resp = await fetch(
          `${GRAPH_API}/${WABA_ID}/message_templates?limit=100&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "send_bulk": {
        const body = await req.json();
        const {
          phone_number_id,
          template_name,
          template_language,
          contacts,
          template_components,
          template_variable_count,
        } = body;
        if (!phone_number_id || !template_name || !contacts?.length) {
          throw new Error("phone_number_id, template_name, contacts required");
        }

        const results: Array<{ to: string; name: string; status: string; error?: string; wamid?: string | null; meta_response?: unknown }> = [];
        const variableCount = typeof template_variable_count === "number"
          ? template_variable_count
          : countTemplateVariables(Array.isArray(template_components) ? template_components : []);

        for (const contact of contacts) {
          try {
            const templateObj: Record<string, unknown> = {
              name: template_name,
              language: { code: template_language || "pt_BR" },
            };

            const components = buildTemplateComponents(contact, variableCount);
            if (components) {
              templateObj.components = components;
            }

            const payload = {
              messaging_product: "whatsapp",
              to: contact.phone,
              type: "template",
              template: templateObj,
            };
            const resp = await fetch(
              `${GRAPH_API}/${phone_number_id}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
              }
            );
            const data = await resp.json();
            console.log("Meta send response:", JSON.stringify(data));
            if (data.error) {
              results.push({ to: contact.phone, name: contact.name, status: "error", error: data.error.message });
            } else {
              const wamid = data.messages?.[0]?.id || null;
              results.push({ to: contact.phone, name: contact.name, status: "sent", wamid, meta_response: data });
            }
          } catch (e) {
            results.push({ to: contact.phone, name: contact.name, status: "error", error: String(e) });
          }
          await new Promise((r) => setTimeout(r, 100));
        }

        const sent = results.filter((r) => r.status === "sent").length;
        const errors = results.filter((r) => r.status === "error").length;
        result = { total: contacts.length, sent, errors, details: results };

        // Salvar histórico de envios bem-sucedidos em whatsapp_messages
        const supabaseUrlBulk = Deno.env.get("SUPABASE_URL");
        const serviceRoleKeyBulk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrlBulk && serviceRoleKeyBulk) {
          const supabaseBulk = createClient(supabaseUrlBulk, serviceRoleKeyBulk);
          const rows = results
            .filter((r) => r.status === "sent")
            .map((r) => ({
              phone: r.to,
              contact_name: r.name || null,
              direction: "outgoing",
              message_type: "template",
              message_text: `[Auto-disparo] Template: ${template_name}`,
              status: "sent",
              wamid: r.wamid || null,
            }));
          if (rows.length > 0) {
            const { error: bulkInsertError } = await supabaseBulk.from("whatsapp_messages").insert(rows);
            if (bulkInsertError) console.error("Failed to persist bulk sends:", bulkInsertError);
          }
        }
        break;
      }

      case "save_records": {
        // Salva registros de mensagens já enviadas externamente no histórico
        const body = await req.json();
        const { records } = body;
        if (!Array.isArray(records) || records.length === 0) {
          throw new Error("records array is required");
        }
        const supabaseUrlSave = Deno.env.get("SUPABASE_URL");
        const serviceRoleKeySave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrlSave || !serviceRoleKeySave) throw new Error("Supabase service role not configured");
        const supabaseSave = createClient(supabaseUrlSave, serviceRoleKeySave);
        const { error: saveError } = await supabaseSave.from("whatsapp_messages").insert(records);
        if (saveError) throw new Error(saveError.message);
        result = { saved: records.length };
        break;
      }

      case "send_text": {
        const body = await req.json();
        const { to, text, phone_number_id, contact_name } = body;
        if (!to || !text) {
          throw new Error("to and text are required");
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceRoleKey) {
          throw new Error("Supabase service role not configured");
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        let phoneId = phone_number_id;
        if (!phoneId) {
          const phonesResp = await fetch(
            `${GRAPH_API}/${WABA_ID}/phone_numbers?access_token=${token}`
          );
          const phonesData = await phonesResp.json();
          const cloudPhone = phonesData?.data?.find(
            (p: Record<string, string>) => p.platform_type === "CLOUD_API"
          );
          phoneId = cloudPhone?.id || phonesData?.data?.[0]?.id;
        }

        if (!phoneId) throw new Error("No phone number found");

        const resp = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text },
          }),
        });
        const data = await resp.json();

        if (data.error) {
          result = data;
          break;
        }

        const wamid = data.messages?.[0]?.id || null;
        const { error: insertError } = await supabase.from("whatsapp_messages").insert({
          phone: to,
          contact_name: contact_name || null,
          direction: "outgoing",
          message_type: "text",
          message_text: text,
          wamid,
          status: "sent",
          timestamp: new Date().toISOString(),
        });

        if (insertError) {
          console.error("Failed to persist outgoing WhatsApp message:", insertError);
          result = { ...data, persisted: false, persistence_error: insertError.message };
          break;
        }

        result = { ...data, persisted: true };
        break;
      }

      case "debug_token": {
        const resp = await fetch(
          `${GRAPH_API}/debug_token?input_token=${token}&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "get_media": {
        const mediaId = url.searchParams.get("media_id");
        if (!mediaId) throw new Error("media_id is required");
        
        const resp = await fetch(`${GRAPH_API}/${mediaId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mediaData = await resp.json();
        
        if (mediaData.url) {
          // Fetch the actual binary and proxy it
          const mediaResp = await fetch(mediaData.url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const blob = await mediaResp.blob();
          return new Response(blob, {
            headers: {
              ...corsHeaders,
              "Content-Type": mediaData.mime_type || "application/octet-stream",
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
        result = { error: "Could not fetch media" };
        break;
      }

      default:
        result = { available_actions: ["phone_numbers", "templates", "send_bulk", "send_text", "get_media", "debug_token"] };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});