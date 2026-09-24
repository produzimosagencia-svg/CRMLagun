import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Relatório público de campanhas de um evento.
//
// Aberto pelo link secreto /relatorio/<token> (enviado aos produtores no
// WhatsApp). O token é o relatorio_token do evento ou o código individual de um
// envio do resumo diário (lagun_resumo_envios.codigo, que registra o clique).
// Sem login: o token identifica o evento, e só as campanhas
// vinculadas a ele em lagun_event_campaigns entram. Nunca devolve tokens nem
// dados de outros eventos.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

const PRESETS_VALIDOS = new Set([
  "today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d",
  "this_year", "last_year", "maximum",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function saoPauloDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Mesmo critério da meta-ads-api: períodos móveis terminam hoje (São Paulo).
function dateFilterForPreset(datePreset: string): string {
  const rollingDays: Record<string, number> = {
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_90d: 90,
  };
  const days = rollingDays[datePreset];
  if (!days) return `date_preset=${encodeURIComponent(datePreset)}`;

  const until = saoPauloDate();
  const anchor = new Date(`${until}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - (days - 1));
  const since = saoPauloDate(anchor);
  return `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
}

type Acao = { action_type: string; value: string };

const valorAcao = (lista: Acao[] | undefined, tipos: string[]) => {
  const a = lista?.find((x) => tipos.includes(x.action_type));
  return a ? Number(a.value) || 0 : 0;
};

// Busca todas as páginas de um endpoint de insights da Graph API.
async function buscarTudo(url: string): Promise<{ data: any[]; error?: any }> {
  const data: any[] = [];
  let proxima: string | null = url;
  let paginas = 0;
  while (proxima && paginas < 10) {
    const resp = await fetch(proxima);
    const corpo = await resp.json();
    if (corpo.error) return { data, error: corpo.error };
    data.push(...(corpo.data || []));
    proxima = corpo.paging?.next || null;
    paginas++;
  }
  return { data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") || "").trim().toLowerCase();
    if (!/^[0-9a-f]{24}$/.test(token)) {
      return json({ error: "link_invalido" }, 400);
    }
    const presetPedido = url.searchParams.get("date_preset") || "maximum";
    const datePreset = PRESETS_VALIDOS.has(presetPedido) ? presetPedido : "maximum";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: evento, error: erroEvento } = await supabase
      .from("lagun_events")
      .select("id, nome, data")
      .eq("relatorio_token", token)
      .maybeSingle();
    if (erroEvento) {
      console.error("[relatorio-evento] erro ao buscar evento", erroEvento.message);
      return json({ error: "erro_interno" }, 500);
    }
    if (!evento) return json({ error: "link_invalido" }, 404);

    const { data: vinculos, error: erroVinculos } = await supabase
      .from("lagun_event_campaigns")
      .select("campaign_id, account_id")
      .eq("event_id", evento.id);
    if (erroVinculos) {
      console.error("[relatorio-evento] erro ao buscar vínculos", erroVinculos.message);
      return json({ error: "erro_interno" }, 500);
    }

    const eventoPublico = { nome: evento.nome, data: evento.data };
    if (!vinculos?.length) {
      return json({ error: "sem_campanhas", evento: eventoPublico }, 404);
    }

    const metaToken = Deno.env.get("META_ADS_TOKEN");
    if (!metaToken) {
      console.error("[relatorio-evento] META_ADS_TOKEN não configurado");
      return json({ error: "meta_indisponivel", evento: eventoPublico }, 502);
    }

    // Campanhas agrupadas por conta de anúncio (normalmente uma só).
    const padraoConta = (Deno.env.get("META_AD_ACCOUNT_ID") || "").replace(/^act_/, "");
    const porConta = new Map<string, string[]>();
    for (const v of vinculos) {
      const conta = String(v.account_id || padraoConta).replace(/^act_/, "");
      if (!/^\d+$/.test(conta) || !/^\d+$/.test(String(v.campaign_id))) continue;
      porConta.set(conta, [...(porConta.get(conta) || []), String(v.campaign_id)]);
    }
    if (!porConta.size) {
      return json({ error: "sem_campanhas", evento: eventoPublico }, 404);
    }
    const idsVinculados = new Set([...porConta.values()].flat());

    const dateFilter = dateFilterForPreset(datePreset);
    const camposCampanha = [
      "campaign_name", "campaign_id", "objective", "spend", "impressions", "reach",
      "clicks", "actions", "action_values", "date_start", "date_stop",
    ].join(",");
    const camposAnuncio = [
      "ad_name", "ad_id", "campaign_name", "campaign_id", "spend", "impressions", "clicks", "ctr",
    ].join(",");

    const linhasCampanha: any[] = [];
    const linhasAnuncio: any[] = [];
    let falhouMeta = false;

    await Promise.all([...porConta.entries()].map(async ([conta, ids]) => {
      const filtro = encodeURIComponent(JSON.stringify([
        { field: "campaign.id", operator: "IN", value: ids },
      ]));
      const [camp, anuncios] = await Promise.all([
        buscarTudo(`${GRAPH_API}/act_${conta}/insights?fields=${camposCampanha}&${dateFilter}&level=campaign&filtering=${filtro}&limit=500&access_token=${metaToken}`),
        buscarTudo(`${GRAPH_API}/act_${conta}/insights?fields=${camposAnuncio}&${dateFilter}&level=ad&filtering=${filtro}&limit=500&access_token=${metaToken}`),
      ]);
      if (camp.error) {
        console.error("[relatorio-evento] insights de campanha", JSON.stringify(camp.error));
        falhouMeta = true;
      }
      if (anuncios.error) {
        // Sem criativos o relatório ainda sai; só registra.
        console.error("[relatorio-evento] insights de anúncio", JSON.stringify(anuncios.error));
      }
      linhasCampanha.push(...camp.data);
      linhasAnuncio.push(...anuncios.data);
    }));

    if (falhouMeta && !linhasCampanha.length) {
      return json({ error: "meta_indisponivel", evento: eventoPublico }, 502);
    }

    // Status (ativa/pausada) das campanhas vinculadas, numa chamada só.
    const statusPorId = new Map<string, boolean>();
    try {
      const ids = [...idsVinculados].slice(0, 50).join(",");
      const r = await fetch(`${GRAPH_API}/?ids=${ids}&fields=effective_status&access_token=${metaToken}`);
      const j = await r.json();
      if (!j.error) {
        for (const [id, c] of Object.entries(j as Record<string, { effective_status?: string }>)) {
          statusPorId.set(id, c.effective_status === "ACTIVE");
        }
      }
    } catch { /* sem status: todas entram como ativas */ }

    // Mesma regra do relatório interno (InternoRelatorios → campanhasDisponiveis).
    const porId = new Map<string, any>();
    let inicioMin = "";
    let fimMax = "";
    for (const row of linhasCampanha) {
      const id = String(row.campaign_id || "");
      if (!idsVinculados.has(id)) continue; // garantia extra: nada fora do evento
      if (row.date_start && (!inicioMin || row.date_start < inicioMin)) inicioMin = row.date_start;
      if (row.date_stop && (!fimMax || row.date_stop > fimMax)) fimMax = row.date_stop;
      const atual = porId.get(id) ?? {
        id, name: row.campaign_name || "Campanha sem nome", objective: row.objective,
        active: statusPorId.get(id) !== false,
        spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, revenue: 0, purchases: 0,
      };
      atual.spend += Number(row.spend || 0);
      atual.impressions += parseInt(row.impressions || "0", 10);
      atual.reach += parseInt(row.reach || "0", 10);
      atual.clicks += parseInt(row.clicks || "0", 10);
      atual.revenue += valorAcao(row.action_values, ["purchase", "omni_purchase"]);
      atual.purchases += valorAcao(row.actions, ["purchase", "omni_purchase"]);
      const principal = (row.actions as Acao[] | undefined)?.find((a) =>
        ["purchase", "omni_purchase", "lead", "onsite_conversion.messaging_first_reply", "link_click"].includes(a.action_type));
      atual.results += principal ? parseInt(principal.value, 10) || 0 : 0;
      porId.set(id, atual);
    }
    const campanhas = [...porId.values()].sort((a, b) => b.spend - a.spend);

    // Criativos: só os 10 de maior gasto (é o que o PDF mostra) buscam miniatura.
    const topAnuncios = linhasAnuncio
      .filter((a) => idsVinculados.has(String(a.campaign_id || "")))
      .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))
      .slice(0, 10);
    const criativos = await Promise.all(topAnuncios.map(async (a) => {
      let thumbnail: string | null = null;
      try {
        const r = await fetch(`${GRAPH_API}/${a.ad_id}?fields=creative{thumbnail_url,image_url,video_id}&access_token=${metaToken}`);
        const d = await r.json();
        thumbnail = d.creative?.image_url || null;
        const videoId = d.creative?.video_id;
        if (!thumbnail && videoId) {
          const vr = await fetch(`${GRAPH_API}/${videoId}?fields=picture,thumbnails&access_token=${metaToken}`);
          const vd = await vr.json();
          const maior = [...(vd.thumbnails?.data || [])].sort(
            (x: any, y: any) => Number(y.width || 0) * Number(y.height || 0) - Number(x.width || 0) * Number(x.height || 0),
          )[0];
          thumbnail = maior?.uri || vd.picture || null;
        }
        thumbnail = thumbnail || d.creative?.thumbnail_url || null;
      } catch { /* sem miniatura: o PDF usa o degradê */ }
      return {
        ad_id: String(a.ad_id), ad_name: a.ad_name, campaign_name: a.campaign_name,
        spend: a.spend, impressions: a.impressions, clicks: a.clicks, ctr: a.ctr, thumbnail,
      };
    }));

    // Dias cobertos pelos dados (usado no "no período de … a …" do PDF).
    let dias = 30;
    if (inicioMin && fimMax) {
      dias = Math.max(1, Math.round((Date.parse(fimMax) - Date.parse(inicioMin)) / 864e5) + 1);
    }

    return json({
      evento: eventoPublico,
      date_preset: datePreset,
      dias,
      periodo: { inicio: inicioMin || null, fim: fimMax || null },
      campanhas,
      criativos,
    });
  } catch (err) {
    console.error("[relatorio-evento] erro", err instanceof Error ? err.message : err);
    return json({ error: "erro_interno" }, 500);
  }
});
