import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const tokenFriday = Deno.env.get('ZIG_TOKEN_FRIDAY')
  const tokenSaturday = Deno.env.get('ZIG_TOKEN_SATURDAY')

  if (!tokenFriday || !tokenSaturday) {
    return new Response(JSON.stringify({ error: 'Tokens não encontrados nos secrets' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Remove existing seed events to avoid duplicates
  await supabase.from('lagun_events').delete().in('superticket_id', ['22540', '22541'])

  const { error } = await supabase.from('lagun_events').insert([
    {
      nome: 'Lagun Friday',
      data: '2026-05-16',
      dia_semana: 'Sexta-feira',
      superticket_id: '22540',
      superticket_token: tokenFriday,
      status: 'upcoming',
    },
    {
      nome: 'Lagun Saturday',
      data: '2026-05-17',
      dia_semana: 'Sábado',
      superticket_id: '22541',
      superticket_token: tokenSaturday,
      status: 'upcoming',
    },
  ])

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, message: 'Eventos Lagun Friday e Saturday criados!' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
