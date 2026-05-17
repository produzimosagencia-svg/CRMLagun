import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EVO_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const INSTANCE = 'lagun'

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
      const { to, text } = await req.json()
      const r = await evo('POST', `/message/sendText/${INSTANCE}`, {
        number: to,
        text,
      })
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
