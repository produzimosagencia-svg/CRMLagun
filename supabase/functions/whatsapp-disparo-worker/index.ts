import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Worker do disparo em fila (whatsapp_disparo_jobs / whatsapp_disparo_itens).
// Chamado pela tela ao criar o disparo, por ele mesmo enquanto houver fila e
// por um cron de 1 min. Pega um lote com trava (whatsapp_disparo_pegar), manda
// pela action send_bulk da whatsapp-api (mesma montagem do template, imagem e
// link rastreável) e grava o resultado de cada contato. Pausa o disparo quando
// a Meta devolve um erro da conta (pagamento pendente, bloqueio, spam) ou
// quando o lote inteiro falha com o mesmo erro (template recusado, etc.).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORCAMENTO_MS = 40_000;
const LOTE = 40;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });

async function rodarLote(sb: any) {
  const { data: pego, error } = await sb.rpc("whatsapp_disparo_pegar", { p_lote: LOTE });
  if (error) throw error;
  if (!pego) return false;
  const job = pego.job;
  const itens = pego.itens as { ordem: number; phone: string; name: string | null; email: string | null }[];
  const soltar = (extra: Record<string, unknown> = {}) =>
    sb.from("whatsapp_disparo_jobs").update({ trava_ate: null, atualizado_em: new Date().toISOString(), ...extra }).eq("id", job.id);

  // Erro da conta que a Meta já devolveu pelo webhook: pausa antes de gastar mais.
  const { data: erroConta } = await sb.rpc("whatsapp_disparo_erro_conta", { p_job: job.id });
  if (erroConta) {
    await sb.from("whatsapp_disparo_itens").update({ status: "pendente" }).eq("job_id", job.id).eq("status", "enviando");
    await soltar({ status: "pausado", motivo_pausa: erroConta });
    return true;
  }
  if (!itens.length) {
    await soltar({ status: "concluido", concluido_em: new Date().toISOString() });
    return true;
  }

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-api?action=send_bulk`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE, "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number_id: job.phone_number_id,
      template_name: job.template_name,
      template_language: job.template_language,
      template_category: job.template_category,
      template_components: job.template_components,
      template_variable_count: job.template_variable_count,
      template_parameter_format: job.template_parameter_format,
      header_image_url: job.header_image_url || undefined,
      tracking_campaign: job.tracking_campaign || undefined,
      contacts: itens.map((i) => ({ phone: i.phone, name: i.name ?? "", email: i.email ?? undefined })),
    }),
  });
  const r = await resp.json().catch(() => ({}));
  if (!resp.ok || !Array.isArray(r?.details)) {
    // A função nem chegou a enviar (imagem do cabeçalho, configuração): pausa com o motivo.
    await sb.from("whatsapp_disparo_itens").update({ status: "pendente" }).eq("job_id", job.id).eq("status", "enviando");
    await soltar({ status: "pausado", motivo_pausa: `Não deu para enviar: ${String(r?.error ?? `erro ${resp.status}`).slice(0, 300)}` });
    return true;
  }

  const agora = new Date().toISOString();
  const detalhes = r.details as { status: string; wamid?: string | null; error?: string; code?: number }[];
  await Promise.all(itens.map((item, idx) => {
    const d = detalhes[idx];
    const ok = d?.status === "sent";
    return sb.from("whatsapp_disparo_itens").update(ok
      ? { status: "enviado", wamid: d.wamid ?? null, erro: null, enviado_em: agora }
      : { status: "falhou", erro: `${d?.code ? `[${d.code}] ` : ""}${String(d?.error ?? "sem resposta da Meta").slice(0, 300)}`, enviado_em: agora })
      .eq("job_id", job.id).eq("ordem", item.ordem);
  }));

  // Lote inteiro com o mesmo erro: é o template ou a conta, não o contato.
  const erros = detalhes.filter((d) => d.status !== "sent");
  if (detalhes.length >= 5 && erros.length === detalhes.length && new Set(erros.map((e) => e.error)).size === 1) {
    await soltar({ status: "pausado", motivo_pausa: `A Meta recusou todo o lote: ${String(erros[0].error ?? "").slice(0, 300)}` });
    return true;
  }
  const { count } = await sb.from("whatsapp_disparo_itens").select("ordem", { count: "exact", head: true })
    .eq("job_id", job.id).in("status", ["pendente", "enviando"]);
  await soltar(count ? {} : { status: "concluido", concluido_em: agora });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const inicio = Date.now();
  let lotes = 0;
  try {
    while (Date.now() - inicio < ORCAMENTO_MS && await rodarLote(sb)) lotes++;
  } catch (e) {
    console.error("whatsapp-disparo-worker", e);
    return json({ ok: false, lotes });
  }
  // Ainda tem fila: chama a si mesmo para continuar sem esperar o cron.
  const { count } = await sb.from("whatsapp_disparo_jobs").select("id", { count: "exact", head: true }).in("status", ["na_fila", "enviando"]);
  if (count && lotes > 0) {
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    EdgeRuntime.waitUntil(fetch(`${SUPABASE_URL}/functions/v1/whatsapp-disparo-worker`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"source":"worker"}',
    }).catch(() => null));
  }
  return json({ ok: true, lotes });
});
