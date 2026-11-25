// Uso único (2026-11-17): copia os templates de UTILIDADE livres da Produzimos
// para as contas de WhatsApp da BM da Lagun. Só cria template; não envia mensagem.
// Exige a chave TEMPLATES_ONCE_KEY no Authorization (não fica aberto ao público).
//   GET  ?acao=contas  → WABAs que o token enxerga, números e templates existentes
//   POST ?acao=criar   { waba, imagem_url, templates: [{ nome, corpo, exemplos, botao_url?, botao_exemplo?, imagem? }] }
//   GET  ?acao=status&waba=...  → status e categoria dos templates
const G = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  const chave = Deno.env.get("TEMPLATES_ONCE_KEY");
  if (!chave || req.headers.get("authorization") !== `Bearer ${chave}`) return Response.json({ erro: "sem permissão" }, { status: 401 });
  const T = Deno.env.get("META_WHATSAPP_TOKEN");
  if (!T) return Response.json({ erro: "META_WHATSAPP_TOKEN ausente" }, { status: 500 });
  const url = new URL(req.url);
  const acao = url.searchParams.get("acao");
  const get = async (p: string) => (await fetch(`${G}/${p}${p.includes("?") ? "&" : "?"}access_token=${T}`)).json();

  if (acao === "contas") {
    const dbg = await get(`debug_token?input_token=${T}`);
    const ids = new Set<string>([Deno.env.get("WHATSAPP_WABA_ID") || ""].filter(Boolean));
    for (const s of dbg?.data?.granular_scopes ?? []) if (String(s.scope).startsWith("whatsapp")) for (const i of s.target_ids ?? []) ids.add(String(i));
    const contas = [];
    for (const id of ids) {
      const info = await get(`${id}?fields=id,name,owner_business_info`);
      const nums = await get(`${id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier`);
      const tps = await get(`${id}/message_templates?limit=200&fields=name,status,category`);
      contas.push({ id, info, numeros: nums.data ?? nums.error, templates: (tps.data ?? []).map((t: any) => `${t.name} ${t.status} ${t.category}`), erro_templates: tps.error?.message });
    }
    return Response.json({ app: dbg?.data?.app_id, tipo: dbg?.data?.type, escopos: dbg?.data?.scopes, contas });
  }

  if (acao === "bm") {
    const bm = url.searchParams.get("bm");
    const extra = url.searchParams.get("waba");
    return Response.json({
      owned: await get(`${bm}/owned_whatsapp_business_accounts?fields=id,name`),
      client: await get(`${bm}/client_whatsapp_business_accounts?fields=id,name`),
      extra: extra ? await get(`${extra}?fields=id,name`) : null,
      extra_nums: extra ? await get(`${extra}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`) : null,
    });
  }

  // Envio de TESTE autorizado pelo Guilherme para números específicos.
  if (acao === "enviar_teste" && req.method === "POST") {
    const b = await req.json();
    const bytes = Uint8Array.from(atob(b.imagem_base64), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("messaging_product", "whatsapp");
    fd.append("type", "image/jpeg");
    fd.append("file", new Blob([bytes], { type: "image/jpeg" }), "flyer.jpg");
    const media = await (await fetch(`${G}/${b.phone_id}/media`, { method: "POST", headers: { Authorization: `Bearer ${T}` }, body: fd })).json();
    if (!media.id) return Response.json({ erro: "media", media }, { status: 500 });
    const res = [];
    for (const d of b.destinos) {
      const comps = [
        { type: "header", parameters: [{ type: "image", image: { id: media.id } }] },
        { type: "body", parameters: d.variaveis.map((v: string) => ({ type: "text", text: v })) },
      ];
      if (b.botao) comps.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: b.botao }] } as any);
      const r = await (await fetch(`${G}/${b.phone_id}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: d.to, type: "template", template: { name: b.template, language: { code: "pt_BR" }, components: comps } }),
      })).json();
      res.push({ to: d.to, r });
    }
    return Response.json({ res });
  }

  // Somente leitura (2026-11-25): métricas de um template (enviadas, entregues, lidas, cliques) e custo na conta.
  //   GET ?acao=analytics&waba=...&template=nome&inicio=unix&fim=unix
  if (acao === "analytics") {
    const w = url.searchParams.get("waba"), nome = url.searchParams.get("template");
    const ini = url.searchParams.get("inicio"), fim = url.searchParams.get("fim");
    const tps = await get(`${w}/message_templates?name=${nome}&fields=id,name,status,category`);
    const t = (tps.data ?? []).find((x: any) => x.name === nome);
    if (!t) return Response.json({ erro: "template não encontrado", tps });
    const ta = await get(`${w}/template_analytics?start=${ini}&end=${fim}&granularity=DAILY&template_ids=[${t.id}]&metric_types=["SENT","DELIVERED","READ","CLICKED"]`);
    const pa = await get(`${w}?fields=pricing_analytics.start(${ini}).end(${fim}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`);
    return Response.json({ template: t, template_analytics: ta, pricing_analytics: pa });
  }

  if (acao === "status") {
    const w = url.searchParams.get("waba");
    const tps = await get(`${w}/message_templates?limit=200&fields=${url.searchParams.get("campos") || "name,status,category,rejected_reason"}`);
    return Response.json(tps);
  }

  if (acao === "criar" && req.method === "POST") {
    const b = await req.json();
    const dbg = await get(`debug_token?input_token=${T}`);
    const app = dbg?.data?.app_id;
    const existentes = new Set(((await get(`${b.waba}/message_templates?limit=500&fields=name`)).data ?? []).map((t: any) => t.name));
    let handle: string | null = null;
    const precisaImagem = b.templates.some((t: any) => t.imagem !== false);
    if (precisaImagem) {
      let bytes: Uint8Array, tipo = "image/jpeg";
      if (b.imagem_base64) {
        bytes = Uint8Array.from(atob(b.imagem_base64), (c) => c.charCodeAt(0));
      } else {
        const img = await fetch(b.imagem_url);
        bytes = new Uint8Array(await img.arrayBuffer());
        tipo = img.headers.get("content-type") || "image/jpeg";
      }
      const s = await (await fetch(`${G}/${app}/uploads?file_name=exemplo&file_length=${bytes.length}&file_type=${encodeURIComponent(tipo)}&access_token=${T}`, { method: "POST" })).json();
      if (!s.id) return Response.json({ erro: "upload", s }, { status: 500 });
      const up = await (await fetch(`${G}/${s.id}`, { method: "POST", headers: { Authorization: `OAuth ${T}`, file_offset: "0" }, body: bytes })).json();
      if (!up.h) return Response.json({ erro: "upload", up }, { status: 500 });
      handle = up.h;
    }
    const resultado = [];
    for (const t of b.templates) {
      if (existentes.has(t.nome)) { resultado.push({ nome: t.nome, pulado: "já existe" }); continue; }
      const comps: any[] = [];
      if (t.imagem !== false) comps.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } });
      comps.push(t.exemplos?.length ? { type: "BODY", text: t.corpo, example: { body_text: [t.exemplos] } } : { type: "BODY", text: t.corpo });
      if (t.rodape) comps.push({ type: "FOOTER", text: t.rodape });
      if (t.botao_url) comps.push({ type: "BUTTONS", buttons: [{ type: "URL", text: t.botao_texto || "Acessar link", url: t.botao_url, example: [t.botao_exemplo] }] });
      const r = await (await fetch(`${G}/${b.waba}/message_templates?access_token=${T}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t.nome, language: "pt_BR", category: t.categoria || "UTILITY", components: comps }),
      })).json();
      resultado.push({ nome: t.nome, r });
    }
    return Response.json({ resultado });
  }
  return Response.json({ erro: "ação inválida" }, { status: 400 });
});
