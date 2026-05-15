import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://public-api.superticket.com.br'
const PAGE_SIZE = 200
const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] // Dom→Sáb

function brasilToday() {
  // UTC-3
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return now.toISOString().split('T')[0]
}

function dateStr(rawDate: string) {
  if (!rawDate) return ''
  return rawDate.split('T')[0]
}

async function fetchAll(endpoint: string, headers: Record<string, string>, eventId: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  while (true) {
    const url = `${BASE}/${endpoint}?page=${page}&perPage=${PAGE_SIZE}&eventId=${eventId}`
    const res = await fetch(url, { headers })
    if (!res.ok) { console.error(`[${endpoint}] ${res.status}`); break }
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
      return new Response(JSON.stringify({ error: 'id obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: event, error } = await supabase
      .from('lagun_events')
      .select('superticket_id, superticket_token')
      .eq('id', eventUuid)
      .single()

    if (error || !event) {
      return new Response(JSON.stringify({ error: 'Evento não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeaders = { Authorization: `Bearer ${event.superticket_token}`, Accept: 'application/json' }

    const [tickets, buyers] = await Promise.all([
      fetchAll('tickets', authHeaders, event.superticket_id),
      fetchAll('buyers', authHeaders, event.superticket_id),
    ])

    // Buyer map for name lookup
    const buyerByEmail = new Map<string, any>()
    for (const b of buyers) { if (b.email) buyerByEmail.set(b.email, b) }

    // Build last-7-days buckets (Brazil time)
    const today = brasilToday()
    const last7: { date: string; label: string; count: number; receita: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(new Date(today + 'T00:00:00').getTime() - i * 86400000)
      last7.push({
        date: d.toISOString().split('T')[0],
        label: DAY_LABELS[d.getUTCDay()],
        count: 0,
        receita: 0,
      })
    }
    const yesterday = last7[5]?.date ?? ''

    let receita = 0
    let cortesias = 0
    let pagos = 0
    const emails = new Set<string>()
    const hoje = { count: 0, receita: 0 }
    const ontem = { count: 0, receita: 0 }
    const ultimas: { nome: string; valor: number; hora: string; cortesia: boolean }[] = []

    const sorted = [...tickets].sort((a, b) =>
      new Date(b.purchase_date || b.completed_date || 0).getTime() -
      new Date(a.purchase_date || a.completed_date || 0).getTime()
    )

    for (const t of sorted) {
      const valor = Number(t.price || 0)
      const isCortesia = valor === 0
      receita += valor
      if (isCortesia) cortesias++; else pagos++

      const email = t.participant?.email || t.email || ''
      if (email) emails.add(email)

      const tDate = dateStr(t.purchase_date || t.completed_date || '')
      if (tDate === today)     { hoje.count++;  hoje.receita  += valor }
      if (tDate === yesterday) { ontem.count++; ontem.receita += valor }

      const bucket = last7.find(d => d.date === tDate)
      if (bucket) { bucket.count++; bucket.receita += valor }

      if (ultimas.length < 10) {
        const buyer = email ? buyerByEmail.get(email) : null
        const nome = buyer?.name ||
          [t.participant?.first_name || t.first_name || '', t.participant?.last_name || t.last_name || '']
            .join(' ').trim() || 'Participante'
        ultimas.push({ nome, valor, hora: t.purchase_date || t.completed_date || '', cortesia: isCortesia })
      }
    }

    const totalVendas = tickets.length
    const participantes = emails.size || buyers.length

    // Cache back to DB
    await supabase.from('lagun_events')
      .update({ total_vendas: totalVendas, receita, participantes, updated_at: new Date().toISOString() })
      .eq('id', eventUuid)

    return new Response(JSON.stringify({
      totalVendas, pagos, cortesias, receita, participantes,
      hoje, ontem, last7, ultimas,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
