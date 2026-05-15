const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://public-api.superticket.com.br'
const PAGE_SIZE = 200

const EVENT_CONFIG: Record<string, { token_env: string; label: string }> = {
  '22540': { token_env: 'ZIG_TOKEN_FRIDAY', label: 'Lagun Friday' },
  '22541': { token_env: 'ZIG_TOKEN_SATURDAY', label: 'Lagun Saturday' },
}

async function fetchAll(endpoint: string, headers: Record<string, string>, eventId: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  while (true) {
    const url = `${BASE}/${endpoint}?page=${page}&perPage=${PAGE_SIZE}&eventId=${eventId}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      console.error(`[${endpoint}] page ${page} → ${res.status}: ${await res.text()}`)
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
    const eventId = url.searchParams.get('event_id') ?? ''
    const config = EVENT_CONFIG[eventId]

    if (!config) {
      return new Response(JSON.stringify({ error: `Evento ${eventId} não configurado` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = Deno.env.get(config.token_env)
    if (!token) {
      return new Response(JSON.stringify({ error: `Token ${config.token_env} não encontrado` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }

    // Fetch tickets and buyers in parallel
    const [tickets, buyers] = await Promise.all([
      fetchAll('tickets', authHeaders, eventId),
      fetchAll('buyers', authHeaders, eventId),
    ])

    // Build buyer map for name enrichment
    const buyerByEmail = new Map<string, any>()
    const buyerById = new Map<string, any>()
    for (const b of buyers) {
      if (b.email) buyerByEmail.set(b.email, b)
      if (b.id) buyerById.set(String(b.id), b)
    }

    // Sort tickets newest first for "últimas compras"
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

      const email =
        t.participant?.email ||
        t.email ||
        (t.buyer_id ? buyerById.get(String(t.buyer_id))?.email : null) ||
        ''
      if (email) emails.add(email)

      if (ultimas.length < 10) {
        const buyer = email ? buyerByEmail.get(email) : null
        const nome =
          buyer?.name ||
          [t.participant?.first_name || t.first_name || '', t.participant?.last_name || t.last_name || '']
            .join(' ')
            .trim() ||
          'Participante'
        const hora = t.purchase_date || t.completed_date || ''
        ultimas.push({ nome, valor, hora })
      }
    }

    return new Response(
      JSON.stringify({
        eventId,
        label: config.label,
        totalVendas: tickets.length,
        receita,
        participantes: emails.size || buyers.length,
        ultimas,
      }),
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
