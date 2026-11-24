import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireEquipe } from "../_shared/equipe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";
const PIPEBOARD_MCP_URL = "https://meta-ads.mcp.pipeboard.co";

// --- Pipeboard MCP helpers ---
async function callPipeboard(method: string, params: Record<string, unknown> = {}, apiKey: string) {
  const resp = await fetch(PIPEBOARD_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: method, arguments: params },
    }),
  });
  return resp.json();
}

async function listPipeboardTools(apiKey: string) {
  const resp = await fetch(PIPEBOARD_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }),
  });
  return resp.json();
}

// --- Meta Ads direct fetch (fallback / read-only) ---
async function fetchMetaAds(token: string, action: string, params: Record<string, string> = {}) {
  const accountId = params.account_id;
  switch (action) {
    case "accounts": {
      const resp = await fetch(
        `${GRAPH_API}/me/adaccounts?fields=id,name,account_id,currency,account_status&access_token=${token}`
      );
      return resp.json();
    }
    case "pages": {
      const resp = await fetch(
        `${GRAPH_API}/me/accounts?fields=id,name,category,access_token,instagram_business_account{id,username}&limit=100&access_token=${token}`
      );
      return resp.json();
    }
    case "campaigns": {
      if (!accountId) return { error: "account_id required" };
      const resp = await fetch(
        `${GRAPH_API}/act_${accountId}/campaigns?fields=id,name,objective,status,daily_budget,lifetime_budget&filtering=[{"field":"status","operator":"IN","value":["ACTIVE","PAUSED"]}]&limit=100&access_token=${token}`
      );
      return resp.json();
    }
    case "insights": {
      if (!accountId) return { error: "account_id required" };
      const datePreset = params.date_preset || "last_30d";
      const fields = "campaign_name,campaign_id,objective,spend,impressions,reach,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas,cost_per_action_type";
      const resp = await fetch(
        `${GRAPH_API}/act_${accountId}/insights?fields=${fields}&date_preset=${datePreset}&level=campaign&limit=500&access_token=${token}`
      );
      return resp.json();
    }
    case "account_insights": {
      if (!accountId) return { error: "account_id required" };
      const datePreset = params.date_preset || "last_30d";
      const fields = "spend,impressions,reach,clicks,actions,action_values,purchase_roas";
      const resp = await fetch(
        `${GRAPH_API}/act_${accountId}/insights?fields=${fields}&date_preset=${datePreset}&access_token=${token}`
      );
      return resp.json();
    }
    default:
      return { error: "Unknown action" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // Auditoria 2026-11-24: só equipe da Lagun (ou service role); cliente do app e chave anon ficam de fora.
  { const eq = await requireEquipe(req); if (!eq.ok) return eq.response; }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const META_ADS_TOKEN = Deno.env.get("META_ADS_TOKEN");
    const PIPEBOARD_API_KEY = Deno.env.get("PIPEBOARD_API_KEY");

    const { messages, event_name, campaign_type, page_id, page_name } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uploadedMediaUrls = messages
      .flatMap((message: any) => Array.isArray(message?.content) ? message.content : [])
      .filter((part: any) => part?.type === "image_url" && part?.image_url?.url)
      .map((part: any) => part.image_url.url as string);

    const latestMediaUrl = uploadedMediaUrls[uploadedMediaUrls.length - 1] || "";

    // Build context about the selected event
    let eventContext = "";
    if (event_name) {
      eventContext += `\nO evento selecionado é: "${event_name}". Use este evento como contexto da campanha, não pergunte novamente.`;
    }
    if (campaign_type) {
      eventContext += `\nO tipo de campanha selecionado é: "${campaign_type}". Use este objetivo, não pergunte novamente.`;
    }
    if (page_id && page_name) {
      eventContext += `\nA página do Facebook selecionada é: "${page_name}" (ID: ${page_id}). Use esta página ao criar campanhas, não pergunte novamente.`;
    }
    if (latestMediaUrl) {
      eventContext += `\nO usuário já enviou um criativo e a URL pública dele é: ${latestMediaUrl}. Considere esse arquivo válido e pronto para uso.`;
    }

    // Fetch Meta Ads data if token is available
    let adsContext = "";
    let pagesContext = "";
    if (META_ADS_TOKEN) {
      try {
        const [accountsResp, pagesResp] = await Promise.all([
          fetchMetaAds(META_ADS_TOKEN, "accounts"),
          fetchMetaAds(META_ADS_TOKEN, "pages"),
        ]);

        // Pages context
        if (pagesResp?.data?.length > 0) {
          pagesContext = `\n\n--- PÁGINAS DO FACEBOOK DISPONÍVEIS ---`;
          for (const page of pagesResp.data) {
            pagesContext += `\n- 📄 **${page.name}** (ID: ${page.id}) | Categoria: ${page.category || "N/A"}`;
            if (page.instagram_business_account) {
              pagesContext += ` | Instagram: @${page.instagram_business_account.username} (ID: ${page.instagram_business_account.id})`;
            }
          }
        }

        if (accountsResp?.data?.length > 0) {
          const accountId = accountsResp.data[0].account_id;
          const [campaignsResp, insightsResp] = await Promise.all([
            fetchMetaAds(META_ADS_TOKEN, "campaigns", { account_id: accountId }),
            fetchMetaAds(META_ADS_TOKEN, "insights", { account_id: accountId, date_preset: "last_7d" }),
          ]);

          adsContext = `\n\n--- DADOS ATUAIS DO META ADS (últimos 7 dias) ---`;
          adsContext += `\nConta de anúncios: ${accountsResp.data[0].name} (ID: act_${accountId}). Use este ID automaticamente, NUNCA peça o ID da conta ao usuário.`;

          if (campaignsResp?.data?.length > 0) {
            adsContext += `\n\nCampanhas ativas:`;
            for (const c of campaignsResp.data) {
              adsContext += `\n- ${c.name} | Status: ${c.status} | Objetivo: ${c.objective}`;
              if (c.daily_budget) adsContext += ` | Budget diário: R$ ${(c.daily_budget / 100).toFixed(2)}`;
            }
          }

          if (insightsResp?.data?.length > 0) {
            adsContext += `\n\nPerformance por campanha (7d):`;
            for (const i of insightsResp.data) {
              adsContext += `\n- ${i.campaign_name}: Gasto R$ ${i.spend} | ${i.impressions} impressões | ${i.clicks} cliques | CTR ${i.ctr}% | CPC R$ ${i.cpc}`;
              if (i.purchase_roas?.length > 0) {
                adsContext += ` | ROAS ${i.purchase_roas[0]?.value}`;
              }
            }
          }
        }
      } catch (e) {
        console.error("Error fetching Meta Ads data:", e);
        adsContext = "\n\n(Não foi possível carregar dados do Meta Ads neste momento)";
      }
    }

    // Discover Pipeboard tools if available
    let pipeboardContext = "";
    let pipeboardTools: any[] = [];
    if (PIPEBOARD_API_KEY) {
      try {
        const toolsResp = await listPipeboardTools(PIPEBOARD_API_KEY);
        if (toolsResp?.result?.tools?.length > 0) {
          pipeboardTools = toolsResp.result.tools;
          pipeboardContext = `\n\n--- FERRAMENTAS PIPEBOARD DISPONÍVEIS (Meta Ads MCP) ---`;
          pipeboardContext += `\nVocê tem acesso a ${pipeboardTools.length} ferramentas para GERENCIAR campanhas do Meta Ads.`;
          pipeboardContext += `\nQuando o usuário pedir para criar, pausar, editar ou gerenciar campanhas, você DEVE usar a função execute_pipeboard_action.`;
          pipeboardContext += `\n\nFerramentas disponíveis:`;
          for (const t of pipeboardTools) {
            pipeboardContext += `\n- ${t.name}: ${t.description || ""}`;
          }
        }
      } catch (e) {
        console.error("Error listing Pipeboard tools:", e);
      }
    }

    const systemPrompt = `Você é o TráfegoGPT, um assistente especialista em tráfego pago e marketing digital para eventos e shows.

Você trabalha para a Tríade Entretenimento, uma produtora de eventos no Espírito Santo, Brasil.

Suas capacidades:
1. **Análise de campanhas**: Você tem acesso aos dados reais do Meta Ads (Facebook/Instagram Ads) e pode analisar performance, sugerir otimizações e identificar problemas.
2. **Criação de estratégias**: Sugira estruturas de campanhas, públicos-alvo, criativos e copy para anúncios.
3. **Relatórios**: Gere relatórios de performance com insights acionáveis.
4. **Recomendações de criativos**: Sugira ideias de criativos (imagens, vídeos, carrosséis) com descrições detalhadas. Quando o usuário enviar imagens, analise-as visualmente e dê feedback.
5. **Otimização de orçamento**: Analise distribuição de budget e sugira realocações.
6. **Gerenciamento de campanhas**: ${PIPEBOARD_API_KEY ? "Você pode CRIAR, EDITAR, PAUSAR e GERENCIAR campanhas diretamente via Pipeboard MCP. Use a função execute_pipeboard_action quando o usuário pedir para executar ações no Meta Ads." : "Atualmente só leitura. Para gerenciar campanhas, peça ao admin configurar o Pipeboard."}

## IMPORTANTE SOBRE UPLOADS DE MÍDIA
Quando o usuário envia imagens ou vídeos pelo chat, eles são automaticamente enviados para um servidor público e as URLs públicas são incluídas na mensagem como "image_url". Essas URLs são PERMANENTES e PÚBLICAS — qualquer servidor (incluindo Meta/Facebook) pode acessá-las.
- NUNCA peça ao usuário para hospedar a imagem em outro lugar (Dropbox, Drive, imgur, pipeboard, etc.)
- NUNCA diga que não consegue acessar a URL — ela é pública e acessível
- Use a URL diretamente como image_url ao criar o ad creative via Pipeboard
- Se precisar da URL da imagem para um anúncio, extraia-a da mensagem do usuário (campo image_url)
- Se alguma ferramenta externa disser que a URL está inacessível, trate isso como limitação/transiente da ferramenta e peça confirmação para tentar novamente; NÃO peça URL externa, hash, hospedagem manual ou upload fora do chat

## FLUXO DE CRIAÇÃO DE CAMPANHAS (OBRIGATÓRIO)

Quando o usuário pedir para criar uma campanha, você DEVE seguir um fluxo de perguntas estruturadas, uma de cada vez. NÃO pule etapas. Apresente as opções SEMPRE como listas numeradas simples (formato: "1. 📢 Opção"). NÃO use blockquote (>). O sistema do chat vai transformar essas opções em botões clicáveis automaticamente.

**Etapa 1 - Página do Facebook:**
Liste as páginas disponíveis (dados abaixo) e peça para o usuário escolher uma:

Qual página do Facebook você quer usar?
1. 📄 Nome da Página
2. 📄 Outra Página

**Etapa 2 - Objetivo da campanha:**

Qual o objetivo da campanha?
1. 📢 Reconhecimento de marca
2. 🚀 Tráfego
3. ❤️ Engajamento
4. 📋 Geração de leads
5. 🛒 Vendas / Conversões
6. 🎯 Retargeting

**Etapa 3 - Orçamento:**

Qual o orçamento?
1. 💰 R$ 20/dia
2. 💰 R$ 50/dia
3. 💰 R$ 100/dia
4. 💰 R$ 200/dia
5. ✏️ Outro valor (me diga qual)

**Etapa 4 - Público-alvo:**

Qual público-alvo?
1. 🎯 Público personalizado (lookalike)
2. 📍 Por localização (ES, Grande Vitória, etc.)
3. 🎵 Por interesse (música, eventos, balada)
4. 👥 Engajados com a página
5. 🔄 Retargeting (visitou site/engajou)
6. ✏️ Personalizado (me descreva)

**Etapa 5 - Duração:**

Quanto tempo a campanha deve rodar?
1. 📅 3 dias
2. 📅 7 dias
3. 📅 14 dias
4. 📅 30 dias
5. ♾️ Sem data de término
6. ✏️ Datas específicas (me diga)

**Etapa 6 - Criativo:**

Já tem o criativo pronto?
1. 📸 Sim, vou enviar agora
2. 💡 Preciso de sugestões de criativo
3. ✏️ Vou usar um que já existe na conta

**Etapa 7 - Confirmação:**
Após coletar tudo, faça um RESUMO completo e peça confirmação:

✅ **Resumo da campanha:**
- Página: Nome
- Objetivo: ...
- Orçamento: R$ X/dia
- Público: ...
- Duração: X dias
- Criativo: ...

Posso criar? (Sim/Não)

Só execute a ação via Pipeboard DEPOIS da confirmação.

## APÓS CONCLUSÃO DA AÇÃO
Quando a ação for executada com sucesso via Pipeboard, SEMPRE responda com este formato:

✅ **Ação Concluída com Sucesso!**

📋 **Relatório de Revisão:**
- **Página:** [nome da página usada]
- **Nome da Campanha:** [nome que foi criado no Meta Ads]
- **Objetivo:** [objetivo selecionado]
- **Orçamento:** [valor do orçamento]
- **Público:** [público-alvo definido]
- **Duração:** [período definido]

Se houve erro, informe de forma clara e ofereça nova tentativa.

Regras:
- Sempre responda em português brasileiro
- Use dados reais quando disponíveis
- Seja direto e prático nas recomendações
- Formate com markdown para melhor leitura
- Quando não tiver dados, informe e sugira ações
- Valores monetários em R$ (reais)
- Ao listar opções, use números e emojis para facilitar a escolha
- NUNCA peça IDs diretamente ao usuário - sempre apresente listas para ele escolher
- NUNCA peça o ID da conta de anúncios - use o que já está nos dados acima automaticamente
- Se o evento, tipo de campanha ou página já foram selecionados (indicados acima), NÃO pergunte novamente. Pule essas etapas do fluxo.
- Quando o usuário enviar uma imagem/vídeo, ela já está hospedada. Use a URL diretamente como criativo, sem pedir link externo.
- Se houver falha ao criar o criativo com a mídia, responda de forma útil e curta, oferecendo nova tentativa com a mesma mídia já enviada, sem solicitar nova hospedagem.
- Quando o objetivo for criar uma campanha completa, continue chamando execute_pipeboard_action até concluir as etapas necessárias. NÃO pare depois de upload_ad_image.
- Só declare sucesso final quando a campanha estiver realmente criada. Se apenas a mídia subir, diga explicitamente que a campanha ainda não foi criada.
${eventContext}${adsContext}${pagesContext}${pipeboardContext}`;

    // Build tools array for AI if Pipeboard is available
    const aiTools: any[] = [];
    if (PIPEBOARD_API_KEY && pipeboardTools.length > 0) {
      aiTools.push({
        type: "function",
        function: {
          name: "execute_pipeboard_action",
          description: "Execute uma ação no Meta Ads via Pipeboard MCP. Use para criar campanhas, ad sets, anúncios, pausar, ativar, editar budgets, etc.",
          parameters: {
            type: "object",
            properties: {
              tool_name: {
                type: "string",
                description: `Nome da ferramenta Pipeboard. Disponíveis: ${pipeboardTools.map((t: any) => t.name).join(", ")}`,
              },
              tool_arguments: {
                type: "object",
                description: "Argumentos para a ferramenta, conforme os parâmetros de cada tool.",
              },
            },
            required: ["tool_name", "tool_arguments"],
          },
        },
      });
    }

    // Use a model that supports multimodal (images)
    const hasImages = messages.some((m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === 'image_url'));
    const model = hasImages ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview";

    const requestBody: any = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    };

    if (aiTools.length > 0) {
      requestBody.tools = aiTools;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido, tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If we have Pipeboard tools, handle tool calls by enqueuing jobs
    if (aiTools.length > 0) {
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          const sendSSE = (content: string) => {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
          };
          const sendJobEvent = (jobId: string) => {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ job_id: jobId })}\n\n`));
          };
          const sendDone = () => {
            controller.enqueue(enc.encode(`data: [DONE]\n\n`));
          };

          try {
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let fullContent = "";
            let toolCalls: any[] = [];
            let buf = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              let idx: number;
              while ((idx = buf.indexOf("\n")) !== -1) {
                let line = buf.slice(0, idx);
                buf = buf.slice(idx + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const delta = parsed.choices?.[0]?.delta;
                  if (delta?.content) {
                    fullContent += delta.content;
                    sendSSE(delta.content);
                  }
                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      if (tc.index !== undefined) {
                        while (toolCalls.length <= tc.index) toolCalls.push({ id: "", function: { name: "", arguments: "" } });
                        if (tc.id) toolCalls[tc.index].id = tc.id;
                        if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                        if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                      }
                    }
                  }
                } catch { /* ignore partial */ }
              }
            }

            // If tool calls detected, enqueue as a background job instead of executing inline
            if (toolCalls.length > 0 && toolCalls[0].function.name === "execute_pipeboard_action") {
              const tc = toolCalls[0];
              const args = JSON.parse(tc.function.arguments);

              // Create a service client to insert job
              const serviceClient = createClient(
                Deno.env.get("SUPABASE_URL")!,
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
              );

              const { data: job, error: jobError } = await serviceClient
                .from("meta_ads_jobs")
                .insert({
                  user_id: user!.id,
                  tool_name: args.tool_name,
                  tool_arguments: JSON.stringify(args.tool_arguments || {}),
                  system_prompt: systemPrompt,
                  ai_messages: messages,
                  ai_model: model,
                  latest_media_url: latestMediaUrl,
                  status: "pending",
                  progress: 0,
                  result: {
                    context: {
                      event_name: event_name || null,
                      campaign_type: campaign_type || null,
                      page_id: page_id || null,
                      page_name: page_name || null,
                    },
                  },
                })
                .select("id")
                .single();

              if (jobError || !job) {
                console.error("Failed to create job:", jobError);
                sendSSE("\n\n❌ Erro ao criar job de processamento.");
              } else {
                console.log("Job created:", job.id, "tool:", args.tool_name);
                sendJobEvent(job.id);
              }
            }

            sendDone();
            controller.close();
          } catch (err) {
            console.error("Stream error:", err);
            const enc2 = new TextEncoder();
            controller.enqueue(enc2.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n❌ Erro interno: ${err instanceof Error ? err.message : "desconhecido"}` } }] })}\n\n`));
            controller.enqueue(enc2.encode(`data: [DONE]\n\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("TráfegoGPT error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});