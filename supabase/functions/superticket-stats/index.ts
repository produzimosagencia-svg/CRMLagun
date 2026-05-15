import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://public-api.superticket.com.br'
const PAGE_SIZE = 200

async function fetchAll(endpoint: string, headers: Record<string, string>, eventId: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  while (true) {
    const url = `${BASE}/${endpoint}?page=${page}&perPage=${PAGE_SIZE}&eventId=${eventId}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      console.error(`[${endpoint}] page ${page} → ${res.status}`)
      break
    }
    const json = await res.json()
    const items = Array.isArray(json) ? json : (json.data ?? [])
    all.push(...items)
    if (items.length < PAGE_SIZE) break
    page++
    if (page > 50) break
  }
  return all
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const eventUuid = url.searchParams.get('id')

    if (!eventUuid) {
      return new Response(JSON.stringify({ error: 'Parâmetro id obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Read event from DB using service role (token stays server-side)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: event, error } = await supabase
      .from('lagun_events')
      .select('superticket_id, superticket_token, nome')
      .eq('id', eventUuid)
      .single()

    if (error || !event) {
      return new Response(JSON.stringify({ error: 'Evento não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeaders = {
      Authorization: `Bearer ${event.superticket_token}`,
      Accept: 'application/json',
    }

    const [tickets, buyers] = await Promise.all([
      fetchAll('tickets', authHeaders, event.superticket_id),
      fetchAll('buyers', authHeaders, event.superticket_id),
    ])

    const buyerByEmail = new Map<string, any>()
    for (const b of buyers) {
      if (b.email) buyerByEmail.set(b.email, b)
    }

    const sorted = [...tickets].sort((a, b) => {
      const da = new Date(a.purchase_date || a.completed_date || 0).getTime()
      const db = new Date(b.purchase_date || b.completed_date || 0).getTime()
      return db - da
    })

    let receita = 0
    const emails = new Set<string>()
    const ultimas: { nome: string; valor: number; hora: string }[] = []

    for (const t of sorted) {
      const valor = Number(t.price || 0)
      receita += valor

      const email = t.participant?.email || t.email || ''
      if (email) emails.add(email)

      if (ultimas.length < 10) {
        const buyer = email ? buyerByEmail.get(email) : null
        const nome =
          buyer?.name ||
          [t.participant?.first_name || t.first_name || '', t.participant?.last_name || t.last_name || '']
            .join(' ').trim() ||
          'Participante'
        ultimas.push({ nome, valor, hora: t.purchase_date || t.completed_date || '' })
      }
    }

    const totalVendas = tickets.length
    const participantes = emails.size || buyers.length

    // Cache stats back to DB
    await supabase
      .from('lagun_events')
      .update({ total_vendas: totalVendas, receita, participantes, updated_at: new Date().toISOString() })
      .eq('id', eventUuid)

    return new Response(
      JSON.stringify({ totalVendas, receita, participantes, ultimas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('superticket-stats error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
