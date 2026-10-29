import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { variantesDoTelefone } from "../_shared/socios.ts";

// Atendimento público de um disparo, aberto pelo link secreto
// /atendimento/<token> (lagun_atendimento_links). Sem login: o token só dá
// acesso às conversas de quem recebeu aquele disparo e respondeu depois.
// GET  ?token=…                      → conversas com a janela de 24h
// POST { token, telefone, texto }    → resposta em texto livre, só com a janela aberta

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const GRAPH_API = "https://graph.facebook.com/v21.0";
const JANELA_MS = 24 * 3600_000;

type Msg = { phone: string; contact_name: string | null; direction: string; message_type: string; message_text: string | null; timestamp: string };

async function paginar(q: () => any, max = 20000): Promise<Msg[]> {
  const out: Msg[] = [];
  for (let de = 0; de < max; de += 1000) {
    const { data, error } = await q().range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function conversas(sb: any, link: any) {
  const campos = "phone, contact_name, direction, message_type, message_text, timestamp";
  // Quem recebeu o disparo: templates com um dos textos do link, depois de "desde".
  const ou = (link.filtros as string[]).map((f) => `message_text.ilike.*${f.replace(/[,()*]/g, "")}*`).join(",");
  const enviados = await paginar(() => sb.from("whatsapp_messages").select(campos)
    .eq("direction", "outgoing").eq("message_type", "template").gte("timestamp", link.desde).or(ou)
    .order("timestamp", { ascending: true }));
  const recebeuEm = new Map<string, string>();
  const chaveDe = new Map<string, string>();
  for (const e of enviados) {
    const vs = variantesDoTelefone(e.phone);
    for (const v of vs) { if (!chaveDe.has(v)) chaveDe.set(v, vs[0]); }
    if (!recebeuEm.has(vs[0])) recebeuEm.set(vs[0], e.timestamp);
  }
  if (!recebeuEm.size) return [];

  // Respostas e conversa depois do disparo.
  const depois = await paginar(() => sb.from("whatsapp_messages").select(campos)
    .gte("timestamp", link.desde).eq("channel", "whatsapp").order("timestamp", { ascending: true }));
  const porContato = new Map<string, Msg[]>();
  for (const m of depois) {
    const k = variantesDoTelefone(m.phone).map((v) => chaveDe.get(v)).find(Boolean);
    if (!k || m.timestamp < recebeuEm.get(k)!) continue;
    porContato.set(k, [...(porContato.get(k) ?? []), m]);
  }

  const agora = Date.now();
  const lista = [];
  for (const [k, msgs] of porContato) {
    const recebidas = msgs.filter((m) => m.direction === "incoming");
    if (!recebidas.length) continue;
    const ultima = recebidas[recebidas.length - 1];
    const fecha = new Date(ultima.timestamp).getTime() + JANELA_MS;
    lista.push({
      telefone: ultima.phone,
      nome: recebidas.find((m) => m.contact_name)?.contact_name ?? null,
      ultima_resposta: ultima.timestamp,
      fecha_em: new Date(fecha).toISOString(),
      aberta: fecha > agora,
      respondido: msgs[msgs.length - 1].direction === "outgoing",
      mensagens: msgs.slice(-30).map((m) => ({
        de: m.direction === "incoming" ? "cliente" : "lagun",
        tipo: m.message_type,
        texto: m.message_text,
        quando: m.timestamp,
      })),
    });
  }
  // Abertas e sem resposta primeiro; dentro delas, quem fecha antes.
  lista.sort((a, b) => Number(b.aberta) - Number(a.aberta) || Number(a.respondido) - Number(b.respondido) || a.fecha_em.localeCompare(b.fecha_em));
  return lista;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const corpo = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const token = String(new URL(req.url).searchParams.get("token") || corpo.token || "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(token)) return json({ error: "link_invalido" }, 404);
    const { data: link } = await sb.from("lagun_atendimento_links").select("*").eq("token", token).maybeSingle();
    if (!link) return json({ error: "link_invalido" }, 404);
    if (new Date(link.expira_em).getTime() < Date.now()) return json({ error: "link_expirado" }, 410);

    if (req.method === "GET") {
      return json({ titulo: link.titulo, expira_em: link.expira_em, resposta_sugerida: link.resposta_sugerida, conversas: await conversas(sb, link) });
    }
    if (req.method !== "POST") return json({ error: "metodo" }, 405);

    const texto = String(corpo.texto || "").trim();
    if (!texto || texto.length > 4000) return json({ error: "texto_invalido" }, 400);
    const alvo = (await conversas(sb, link)).find((c) => variantesDoTelefone(c.telefone).some((v) => variantesDoTelefone(String(corpo.telefone || "")).includes(v)));
    if (!alvo) return json({ error: "contato_fora_do_disparo" }, 403);
    if (!alvo.aberta) return json({ error: "janela_fechada" }, 409);

    const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const waToken = Deno.env.get("META_WHATSAPP_TOKEN");
    if (!phoneId || !waToken) return json({ error: "whatsapp_nao_configurado" }, 500);
    const r = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: alvo.telefone, type: "text", text: { body: texto } }),
    });
    const d = await r.json().catch(() => ({}));
    if (d?.error) return json({ error: "meta", detalhe: String(d.error.message ?? "").slice(0, 200) }, 502);
    await sb.from("whatsapp_messages").insert({
      phone: alvo.telefone, contact_name: alvo.nome, direction: "outgoing", message_type: "text",
      message_text: texto, status: "sent", wamid: d?.messages?.[0]?.id ?? null, channel: "whatsapp",
    });
    return json({ ok: true });
  } catch (e) {
    console.error("atendimento-disparo", e);
    return json({ error: "erro_interno" }, 500);
  }
});
