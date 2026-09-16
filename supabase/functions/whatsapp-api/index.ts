import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") || "1169322241814706";

type TemplateComponent = {
  type?: string;
  text?: string;
  buttons?: Array<{ type?: string; url?: string }>;
};

type TemplateParameterFormat = "NAMED" | "POSITIONAL";

type Contact = {
  name?: string;
  phone: string;
  email?: string;
};

const getTemplateVariables = (text = "") =>
  [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1].trim());

const countTemplateVariables = (components: TemplateComponent[] = []) => {
  return components.reduce((maxCount, component) => {
    if (typeof component.text !== "string") return maxCount;

    const variables = getTemplateVariables(component.text);
    const positional = variables
      .filter((variable) => /^\d+$/.test(variable))
      .map(Number);
    if (positional.length > 0) return Math.max(maxCount, ...positional);
    return Math.max(maxCount, variables.length);
  }, 0);
};

const renderTemplateText = (components: TemplateComponent[], contact: Contact, templateName: string) => {
  const body = components.find((component) => component.type?.toUpperCase() === "BODY")?.text;
  if (!body) return `[Template: ${templateName}]`;
  let index = 0;
  return body.replace(/\{\{\s*[^{}]+?\s*\}\}/g, () => index++ === 0 ? contact.name?.trim() || "cliente" : "-");
};

const buildTemplateComponents = (
  contact: Contact,
  templateComponents: TemplateComponent[],
  variableCount: number,
  parameterFormat: TemplateParameterFormat,
  headerImageId?: string,
  trackingToken?: string,
) => {
  const textComponents = templateComponents.flatMap((component) => {
    const componentType = component.type?.toUpperCase();
    if ((componentType !== "BODY" && componentType !== "HEADER") || !component.text) return [];

    const variables = getTemplateVariables(component.text);
    if (variables.length === 0) return [];

    return [{
      type: componentType.toLowerCase(),
      parameters: variables.map((variable, index) => ({
        type: "text",
        text: index === 0 ? contact.name?.trim() || "cliente" : "-",
        ...(parameterFormat === "NAMED" ? { parameter_name: variable } : {}),
      })),
    }];
  });

  const mediaComponents = headerImageId
    ? [{
        type: "header",
        parameters: [{
          type: "image",
          image: { id: headerImageId },
        }],
      }]
    : [];

  const buttonComponents = trackingToken ? templateComponents.flatMap((component) => {
    if (component.type?.toUpperCase() !== "BUTTONS") return [];
    return (component.buttons ?? []).flatMap((button, index) =>
      button.type?.toUpperCase() === "URL" && button.url?.includes("{{1}}")
        ? [{ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: trackingToken }] }]
        : []
    );
  }) : [];
  const resolvedComponents = [...mediaComponents, ...textComponents, ...buttonComponents];
  if (resolvedComponents.length > 0) return resolvedComponents;
  if (variableCount <= 0) return undefined;

  // Compatibilidade com templates posicionais antigos, quando a API não
  // devolve a definição completa dos componentes.
  return [{
    type: "body",
    parameters: Array.from({ length: variableCount }, (_, index) => ({
      type: "text",
      text: index === 0 ? contact.name?.trim() || "cliente" : "-",
    })),
  }];
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

    // get_media é carregado via <img> (não envia header de auth) — permanece
    // acessível. Todas as demais actions exigem um usuário autenticado real
    // (bloqueia a anon key pública, fechando o disparo em massa não autorizado).
    if (action !== "get_media") {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
    }

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

      case "status_summary": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceRoleKey) {
          throw new Error("Supabase service role not configured");
        }

        // O painel não deve depender do RLS do navegador para exibir o status.
        // A action já passou por requireUser acima; a leitura privilegiada fica
        // restrita à função e devolve somente mensagens de template.
        const admin = createClient(supabaseUrl, serviceRoleKey);
        const messagesQuery = () => admin
          .from("whatsapp_messages")
          .select("id,contact_name,phone,message_text,timestamp,status,wamid,template_category,raw_payload", { count: "exact" })
          .eq("direction", "outgoing")
          .eq("message_type", "template");
        const countQuery = () => admin
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("direction", "outgoing")
          .eq("message_type", "template");

        const [messagesResult, totalResult, sentResult, deliveredResult, readResult, failedResult] = await Promise.all([
          messagesQuery().order("timestamp", { ascending: false }).limit(1000),
          countQuery(),
          countQuery().eq("status", "sent"),
          countQuery().eq("status", "delivered"),
          countQuery().eq("status", "read"),
          countQuery().in("status", ["failed", "error", "undelivered"]),
        ]);

        const firstError = [messagesResult, totalResult, sentResult, deliveredResult, readResult, failedResult]
          .find((queryResult) => queryResult.error)?.error;
        if (firstError) throw new Error(firstError.message);

        result = {
          data: messagesResult.data ?? [],
          counts: {
            total: totalResult.count ?? 0,
            sent: sentResult.count ?? 0,
            delivered: deliveredResult.count ?? 0,
            read: readResult.count ?? 0,
            failed: failedResult.count ?? 0,
          },
          generated_at: new Date().toISOString(),
        };
        break;
      }

      case "create_template": {
        const body = await req.json();
        const payload = {
          name: body.name,
          language: body.language || "pt_BR",
          category: body.category || "UTILITY",
          parameter_format: body.parameter_format || "POSITIONAL",
          components: body.components,
        };
        if (!payload.name || !Array.isArray(payload.components) || payload.components.length === 0) {
          throw new Error("name and components required");
        }
        const resp = await fetch(`${GRAPH_API}/${WABA_ID}/message_templates`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = await resp.json();
        if (!resp.ok) {
          return new Response(JSON.stringify(result), {
            status: resp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        break;
      }

      case "send_bulk": {
        const body = await req.json();
        const {
          phone_number_id,
          template_name,
          template_language,
          template_category,
          contacts,
          template_components,
          template_variable_count,
          template_parameter_format,
          header_image_url,
          tracking_campaign,
        } = body;
        if (!phone_number_id || !template_name || !contacts?.length) {
          throw new Error("phone_number_id, template_name, contacts required");
        }

        const results: Array<{ to: string; name: string; status: string; error?: string; wamid?: string | null; meta_response?: unknown }> = [];
        const variableCount = typeof template_variable_count === "number"
          ? template_variable_count
          : countTemplateVariables(Array.isArray(template_components) ? template_components : []);
        const parameterFormat: TemplateParameterFormat =
          String(template_parameter_format).toUpperCase() === "NAMED" ? "NAMED" : "POSITIONAL";
        const templateComponents: TemplateComponent[] =
          Array.isArray(template_components) ? template_components : [];
        let headerImageId: string | undefined;

        // Faz o upload da imagem uma única vez para a própria infraestrutura
        // de mídia do WhatsApp. Usar media_id evita que a Meta precise resolver
        // e baixar um link externo para cada destinatário.
        if (typeof header_image_url === "string" && header_image_url) {
          const imageResponse = await fetch(header_image_url);
          if (!imageResponse.ok) {
            throw new Error(`Não foi possível baixar a imagem do template (${imageResponse.status})`);
          }

          const imageBlob = await imageResponse.blob();
          const mediaForm = new FormData();
          mediaForm.append("messaging_product", "whatsapp");
          mediaForm.append(
            "file",
            imageBlob,
            `template-header.${imageBlob.type === "image/png" ? "png" : "jpg"}`,
          );

          const mediaResponse = await fetch(`${GRAPH_API}/${phone_number_id}/media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: mediaForm,
          });
          const mediaData = await mediaResponse.json();
          if (!mediaResponse.ok || !mediaData?.id) {
            throw new Error(
              mediaData?.error?.message || "A Meta recusou o upload da imagem do template",
            );
          }
          headerImageId = mediaData.id;
        }

        // Cliente criado antes do loop: cada envio é gravado na hora (não em lote
        // no final), pra que o painel "Últimos disparos" reflita o progresso ao vivo.
        const supabaseUrlBulk = Deno.env.get("SUPABASE_URL");
        const serviceRoleKeyBulk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const supabaseBulk = (supabaseUrlBulk && serviceRoleKeyBulk)
          ? createClient(supabaseUrlBulk, serviceRoleKeyBulk)
          : null;
        const templateCat = template_category === "UTILITY" ? "UTILITY" : "MARKETING";

        for (const contact of contacts) {
          let rowStatus = "sent";
          let wamid: string | null = null;
          let errText: string | null = null;
          let trackingToken: string | undefined;
          if (supabaseBulk && tracking_campaign) {
            trackingToken = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
            const { error: trackingError } = await supabaseBulk.from("wa_tracking_links").insert({
              token: trackingToken, campaign_key: tracking_campaign, template_name,
              recipient_name: contact.name || null, phone: contact.phone, email: contact.email || null,
            });
            if (trackingError) { console.error("Failed to create tracking link:", trackingError); trackingToken = undefined; }
          }
          try {
            const templateObj: Record<string, unknown> = {
              name: template_name,
              language: { code: template_language || "pt_BR" },
            };

            const components = buildTemplateComponents(
              contact,
              templateComponents,
              variableCount,
              parameterFormat,
              headerImageId,
              trackingToken,
            );
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
              rowStatus = "failed";
              errText = data.error.message;
              results.push({ to: contact.phone, name: contact.name, status: "error", error: data.error.message });
            } else {
              wamid = data.messages?.[0]?.id || null;
              results.push({ to: contact.phone, name: contact.name, status: "sent", wamid, meta_response: data });
            }
          } catch (e) {
            rowStatus = "failed";
            errText = String(e);
            results.push({ to: contact.phone, name: contact.name, status: "error", error: String(e) });
          }

          // Grava o envio (sucesso ou falha) imediatamente → progresso ao vivo.
          if (supabaseBulk) {
            const { error: rowErr } = await supabaseBulk.from("whatsapp_messages").insert({
              phone: contact.phone,
              contact_name: contact.name || null,
              direction: "outgoing",
              message_type: "template",
              message_text: rowStatus === "failed"
                ? `[Auto-disparo] Falha: ${errText ?? "erro"} (Template: ${template_name})`
                : renderTemplateText(templateComponents, contact, template_name),
              status: rowStatus,
              wamid: wamid,
              template_category: templateCat,
              channel: "whatsapp",
              raw_payload: { phone_number_id, template_name, template_components: templateComponents },
            });
            if (rowErr) console.error("Failed to persist send:", rowErr);
          }

          await new Promise((r) => setTimeout(r, 100));
        }

        const sent = results.filter((r) => r.status === "sent").length;
        const errors = results.filter((r) => r.status === "error").length;
        result = { total: contacts.length, sent, errors, details: results };
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
          channel: "whatsapp",
          raw_payload: { phone_number_id: phoneId },
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
        result = { available_actions: ["phone_numbers", "templates", "status_summary", "create_template", "send_bulk", "send_text", "get_media", "debug_token"] };
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
