import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EVO_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const INSTANCE = 'lagun'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function evo(method: string, path: string, body?: any) {
  const res = await fetch(`${EVO_URL}${path}`, {
    method,
    headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) } }
  catch { return { ok: res.ok, status: res.status, data: text } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    // ── Criar instância se não existir ─────────────────────────────────
    if (action === 'create') {
      const r = await evo('POST', '/instance/create', {
        instanceName: INSTANCE,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      })
      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Buscar QR code ─────────────────────────────────────────────────
    if (action === 'qr') {
      const r = await evo('GET', `/instance/connect/${INSTANCE}`)
      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Status da conexão ──────────────────────────────────────────────
    if (action === 'status') {
      const r = await evo('GET', `/instance/connectionState/${INSTANCE}`)
      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Listar instâncias ──────────────────────────────────────────────
    if (action === 'list') {
      const r = await evo('GET', '/instance/fetchInstances')
      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Enviar mensagem ────────────────────────────────────────────────
    if (action === 'send') {
      const { to, text, contact_name } = await req.json()
      const r = await evo('POST', `/message/sendText/${INSTANCE}`, { number: to, text })

      // Salvar mensagem enviada no banco
      if (r.ok) {
        try {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
          const messageId = r.data?.key?.id || r.data?.id || null
          await supabase.from('whatsapp_messages').insert({
            wamid: messageId,
            phone: to.replace('@s.whatsapp.net', '').replace('@c.us', ''),
            contact_name: contact_name || null,
            direction: 'outgoing',
            message_type: 'text',
            message_text: text,
            media_url: null,
            timestamp: new Date().toISOString(),
            status: 'sent',
            channel: 'whatsapp',
          })
        } catch (dbErr) {
          console.error('Failed to save sent message:', dbErr)
        }
      }

      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Configurar webhook ─────────────────────────────────────────────
    if (action === 'set_webhook') {
      const webhookUrl = `https://xwxiijbovreucnrbyput.supabase.co/functions/v1/whatsapp-webhook`
      const r = await evo('POST', `/webhook/set/${INSTANCE}`, {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        },
      })
      // Also try alternative payload format (older Evolution API versions)
      if (!r.ok) {
        const r2 = await evo('POST', `/webhook/set/${INSTANCE}`, {
          url: webhookUrl,
          enabled: true,
          webhookByEvents: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        })
        return new Response(JSON.stringify(r2.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Ver config do webhook ──────────────────────────────────────────
    if (action === 'get_webhook') {
      const r = await evo('GET', `/webhook/find/${INSTANCE}`)
      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Desconectar ────────────────────────────────────────────────────
    if (action === 'logout') {
      const r = await evo('DELETE', `/instance/logout/${INSTANCE}`)
      return new Response(JSON.stringify(r.data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'action inválida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
