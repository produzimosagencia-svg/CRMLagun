// Uso único: o template departamento_lagun_link_desconto já foi enviado à Meta
// (id 1136906085378041). Agora esta função só consulta o status dele, sem
// parâmetros de entrada e sem alterar nada.
const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async () => {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  const waba = Deno.env.get("WHATSAPP_WABA_ID");
  if (!token || !waba) return Response.json({ error: "segredos do WhatsApp ausentes" }, { status: 500 });
  const campos = "name,status,category,rejected_reason,quality_score";
  const resp = await fetch(`${GRAPH_API}/${waba}/message_templates?name=departamento_lagun_link_desconto&fields=${campos}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Response.json(await resp.json(), { status: resp.status });
});
