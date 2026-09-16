import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart, Instagram, MessageCircle, MessagesSquare, MousePointerClick,
  TrendingUp, Users, Zap, ExternalLink,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { BarraIndicadores, CORES } from '@/components/interno/BarraIndicadores';

const db = supabase as any;
const LAGUN_IG_ID = '17841436376156784';

/* ──────────────────────────────────────────────────────────────────────────
 * Dashboard de redes sociais.
 *
 * Só usa dado que a gente realmente consegue ler. Os Insights do Instagram
 * (alcance, impressões, visitas ao perfil) respondem "(#10) Application does
 * not have permission" porque o app não tem acesso avançado a read_insights —
 * então nada de card fingindo número. O que dá para medir de verdade:
 *   • perfil e publicações           → API do Instagram (funciona)
 *   • curtidas e comentários por post → API do Instagram (funciona)
 *   • DMs recebidas                   → whatsapp_messages (channel=instagram)
 *   • comentários captados            → ig_events
 *   • cliques no link                 → link_clicks
 *   • automações                      → ig_automations / ig_queue / ig_links
 * ────────────────────────────────────────────────────────────────────────── */

const AMARELO = '#FFE14D';
const VERDE = '#34D399';
const AZUL = '#60A5FA';
const ROSA = '#F472B6';

interface Post {
  id: string; caption?: string; media_type?: string; permalink?: string;
  thumbnail_url?: string; media_url?: string; timestamp: string;
  like_count?: number; comments_count?: number;
}
interface Perfil { username: string; followers_count: number; media_count: number; profile_picture_url?: string }
interface SerieDia { dia: string; dms: number; cliques: number }
interface EventoClique { nome: string; cliques: number }
interface ResumoAutomacoes { ativas: number; disparos: number; dms: number; cliques: number }
/** Comentário ou direct recebido — o RPC já descarta os que são só emoji. */
interface Interacao { texto: string | null; autor: string | null; arroba?: string | null; quando: string }

const nf = new Intl.NumberFormat('pt-BR');
const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;
const diaCurto = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

async function chamarInstagram(action: string, params: Record<string, string> = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Sessão expirada.');
  const q = new URLSearchParams({ action, ...params });
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-api?${q}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || j.error || 'Falha ao consultar o Instagram.');
  return j;
}

function Kpi({ icon: Icon, label, valor, sub, cor = AMARELO, destaque = false }: {
  icon: typeof Users; label: string; valor: string; sub?: string; cor?: string; destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${cor}1F`, color: cor }}>
          <Icon size={14} />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight" style={destaque ? { color: cor } : undefined}>{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Caixa dos painéis. `corpo` reserva a altura do conteúdo desde o primeiro
 * quadro: sem isso a página nasce curta e cresce quando os dados chegam, e
 * quem rola nesse meio-tempo passa do fim do conteúdo e enxerga o fundo
 * escuro do container.
 */
/** Blocos cinza no lugar do conteúdo: ocupam o mesmo espaço do resultado. */
function Esqueleto({ linhas, altura }: { linhas: number; altura: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg bg-muted/60" style={{ height: altura }} />
      ))}
    </div>
  );
}

function CaixaGrafico({ titulo, sub, children, acao, corpo = 244 }: { titulo: string; sub?: string; children: React.ReactNode; acao?: React.ReactNode; corpo?: number }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4" style={{ minHeight: corpo + 58 }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold">{titulo}</h2>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {acao}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center" style={{ minHeight: corpo }}>{children}</div>
    </div>
  );
}

// itemStyle é obrigatório: sem ele o recharts escreve o valor em preto, que
// some no fundo escuro do balão.
const tooltipStyle = {
  contentStyle: { background: '#12121A', border: '1px solid #1E1E29', borderRadius: 10, fontSize: 12 },
  labelStyle: { color: '#8B8A9B', marginBottom: 4 },
  itemStyle: { color: '#F2F1F7' },
  cursor: { fill: 'rgba(255,255,255,.06)', stroke: 'rgba(255,255,255,.12)' },
} as const;

/** Lista de comentários/directs recentes, no mesmo formato nos dois painéis. */
function ListaInteracoes({ itens, vazio, carregando }: { itens: Interacao[]; vazio: string; carregando: boolean }) {
  if (carregando) return <Esqueleto linhas={1} altura={190} />;
  if (!itens.length) return <p className="text-center text-sm text-muted-foreground">{vazio}</p>;
  const quando = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return `${Math.max(min, 1)} min`;
    if (min < 1440) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} d`;
  };
  return (
    <div className="space-y-1.5">
      {itens.map((it, i) => {
        const nome = it.arroba || it.autor;
        const hue = [...(nome || String(i))].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
        return (
          <div key={`${it.quando}-${i}`} className="flex items-start gap-2.5 rounded-lg border border-border/60 px-2.5 py-2">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
              style={{ background: `radial-gradient(circle at 30% 30%, oklch(.70 .15 ${hue}), oklch(.42 .17 ${hue}) 70%)` }}>
              {(nome || '?').replace(/^@/, '').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold">{nome ? `@${String(nome).replace(/^@/, '')}` : 'Sem nome'}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{quando(it.quando)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{it.texto}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function InternoDashboardSocial() {
  const [dias, setDias] = useState<7 | 30 | 90>(30);
  const [carregando, setCarregando] = useState(true);
  const [erroIg, setErroIg] = useState('');
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [serie, setSerie] = useState<SerieDia[]>([]);
  const [porEvento, setPorEvento] = useState<EventoClique[]>([]);
  const [totais, setTotais] = useState({ dms: 0, comentarios: 0, cliques: 0 });
  const [automacoes, setAutomacoes] = useState<ResumoAutomacoes>({ ativas: 0, disparos: 0, dms: 0, cliques: 0 });
  const [ultimosComentarios, setUltimosComentarios] = useState<Interacao[]>([]);
  const [ultimosDirects, setUltimosDirects] = useState<Interacao[]>([]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErroIg('');
    const desde = new Date(Date.now() - dias * 86400_000).toISOString();

    // Instagram (pode falhar sem derrubar o resto do painel)
    const ig = chamarInstagram('accounts')
      .then(async (contas) => {
        const conta = (contas.data || []).map((p: any) => p.instagram_business_account).find(Boolean);
        if (!conta) throw new Error('Nenhuma conta do Instagram vinculada.');
        setPerfil({ username: conta.username, followers_count: conta.followers_count ?? 0, media_count: conta.media_count ?? 0, profile_picture_url: conta.profile_picture_url });
        const midia = await chamarInstagram('media', { ig_id: conta.id || LAGUN_IG_ID, limit: '50' });
        setPosts((midia.data || []) as Post[]);
      })
      .catch((e) => setErroIg(e instanceof Error ? e.message : String(e)));

    // Banco: uma RPC agrega tudo. Contar no cliente dava número errado porque
    // o PostgREST corta qualquer consulta em 1000 linhas (max_rows).
    const banco = (async () => {
      const [{ data: resumo }, { data: coments }, { data: dms }] = await Promise.all([
        db.rpc('painel_social_resumo', { p_dias: dias }),
        db.rpc('painel_ultimos_comentarios', { p_limite: 8 }),
        db.rpc('painel_ultimos_directs', { p_limite: 8 }),
      ]);
      if (resumo) {
        setSerie((resumo.serie ?? []) as SerieDia[]);
        setPorEvento((resumo.por_evento ?? []) as EventoClique[]);
        setTotais({ dms: resumo.dms ?? 0, comentarios: resumo.comentarios ?? 0, cliques: resumo.cliques ?? 0 });
        setAutomacoes(resumo.automacoes ?? { ativas: 0, disparos: 0, dms: 0, cliques: 0 });
      }
      setUltimosComentarios((coments ?? []) as Interacao[]);
      setUltimosDirects((dms ?? []) as Interacao[]);
    })();

    await Promise.all([ig, banco]);
    setCarregando(false);
  }, [dias]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Engajamento: curtidas + comentários das publicações dentro do período.
  const postsPeriodo = useMemo(() => {
    const corte = Date.now() - dias * 86400_000;
    return posts.filter((p) => new Date(p.timestamp).getTime() >= corte);
  }, [posts, dias]);

  const engajamento = useMemo(() => {
    const base = postsPeriodo.length ? postsPeriodo : posts.slice(0, 12);
    const curtidas = base.reduce((a, p) => a + (p.like_count ?? 0), 0);
    const comentarios = base.reduce((a, p) => a + (p.comments_count ?? 0), 0);
    const seguidores = perfil?.followers_count ?? 0;
    const taxa = base.length && seguidores ? ((curtidas + comentarios) / base.length / seguidores) * 100 : 0;
    return { curtidas, comentarios, taxa, posts: base.length, usandoFallback: !postsPeriodo.length && posts.length > 0 };
  }, [postsPeriodo, posts, perfil]);

  const topPosts = useMemo(
    () => [...posts].sort((a, b) => ((b.like_count ?? 0) + (b.comments_count ?? 0)) - ((a.like_count ?? 0) + (a.comments_count ?? 0))).slice(0, 5),
    [posts],
  );

  const serieEngajamento = useMemo(
    () => [...posts]
      .filter((p) => (p.like_count ?? 0) + (p.comments_count ?? 0) > 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-12)
      .map((p) => ({ dia: diaCurto(new Date(p.timestamp)), engajamento: (p.like_count ?? 0) + (p.comments_count ?? 0), tipo: p.media_type })),
    [posts],
  );

  const Periodo = ({ v, label }: { v: 7 | 30 | 90; label: string }) => {
    const ativo = dias === v;
    return (
      <button
        onClick={() => setDias(v)}
        className={`rounded-full px-5 py-2 text-[13px] font-semibold transition-all ${
          ativo ? 'text-black' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
        }`}
        style={ativo ? { background: 'linear-gradient(135deg,#FFEC8A,#FFE14D 45%,#E8B923)', boxShadow: '0 0 18px rgba(255,225,77,.45)' } : undefined}
      >{label}</button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Só o seletor de período: identidade e perfil vivem na barra abaixo. */}
      <div className="flex justify-center">
        <div className="flex gap-1 rounded-full border border-[#FFE14D]/25 bg-card p-1.5 shadow-[0_4px_24px_rgba(0,0,0,.35)]">
          <Periodo v={7} label="7 dias" /><Periodo v={30} label="30 dias" /><Periodo v={90} label="90 dias" />
        </div>
      </div>

      {erroIg && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <span className="font-medium text-amber-600 dark:text-amber-400">Instagram indisponível:</span>{' '}
          <span className="text-muted-foreground">{erroIg}</span>
        </div>
      )}

      {/* Indicadores */}
      <BarraIndicadores
        titulo="Instagram conectado"
        subtitulo={perfil ? <>@{perfil.username} · {nf.format(perfil.media_count)} publicações</> : 'carregando…'}
        carregando={carregando && !perfil}
        avatar={perfil?.profile_picture_url
          ? <img src={perfil.profile_picture_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white/15"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white/70"><Instagram size={18} /></span>}
        itens={[
          { label: 'Seguidores', valor: perfil ? nf.format(perfil.followers_count) : '—', sub: 'conta profissional', cor: CORES.ouro, barra: 100 },
          { label: 'Engajamento', valor: engajamento.taxa ? pct(engajamento.taxa) : '—', sub: engajamento.posts ? `média de ${engajamento.posts} ${engajamento.posts === 1 ? 'post' : 'posts'}` : undefined, cor: CORES.verde, barra: Math.min(100, engajamento.taxa * 20) },
          { label: 'DMs recebidas', valor: nf.format(totais.dms), sub: `últimos ${dias} dias`, cor: CORES.rosa, barra: 62 },
          { label: 'Curtidas', valor: nf.format(engajamento.curtidas), sub: engajamento.posts ? `em ${engajamento.posts} ${engajamento.posts === 1 ? 'publicação' : 'publicações'}` : 'nas publicações', cor: CORES.azul, barra: 70 },
          { label: 'Cliques no link', valor: nf.format(totais.cliques), sub: `${nf.format(Math.round(totais.cliques / Math.max(dias, 1)))}/dia em média`, cor: CORES.branco, barra: 80 },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Movimento diário */}
        <CaixaGrafico titulo="Movimento diário" sub="Cliques no link da landing (eixo à esquerda) e DMs recebidas no Instagram (à direita)">
          {carregando ? (
            <Esqueleto linhas={1} altura={220} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={serie} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCliques" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={AMARELO} stopOpacity={0.35} /><stop offset="100%" stopColor={AMARELO} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDms" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ROSA} stopOpacity={0.3} /><stop offset="100%" stopColor={ROSA} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E29" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#8B8A9B' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                {/* Eixos separados: são ~600 cliques/dia contra ~40 DMs — no mesmo
                    eixo a linha das DMs ficaria colada no zero e ilegível. */}
                <YAxis yAxisId="cliques" tick={{ fontSize: 10, fill: '#8B8A9B' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="dms" orientation="right" tick={{ fontSize: 10, fill: ROSA }} axisLine={false} tickLine={false} width={34} />
                <Tooltip {...tooltipStyle} />
                <Area yAxisId="cliques" type="monotone" dataKey="cliques" name="Cliques no link" stroke={AMARELO} strokeWidth={2} fill="url(#gCliques)" />
                <Area yAxisId="dms" type="monotone" dataKey="dms" name="DMs" stroke={ROSA} strokeWidth={2} fill="url(#gDms)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CaixaGrafico>

        {/* Top publicações */}
        <CaixaGrafico titulo="Publicações que mais engajaram" sub="Curtidas + comentários, entre as últimas 50">
          {topPosts.length === 0 ? (
            carregando ? <Esqueleto linhas={5} altura={44} /> : <p className="text-center text-sm text-muted-foreground">Nenhuma publicação encontrada.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {topPosts.map((p, i) => (
                <a key={p.id} href={p.permalink} target="_blank" rel="noreferrer"
                  className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 transition-colors hover:border-[#FFE14D]/50">
                  <div className="relative aspect-square bg-muted">
                    {(p.thumbnail_url || p.media_url) && (
                      <img src={p.thumbnail_url || p.media_url} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                    )}
                    <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-[10px] font-bold text-white">{i + 1}</span>
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="flex items-center gap-1.5 text-xs"><Heart size={12} className="shrink-0 fill-[#F9A8D4] text-[#F9A8D4]" /> {nf.format(p.like_count ?? 0)}</p>
                    <p className="flex items-center gap-1.5 text-xs"><MessageCircle size={12} className="shrink-0 text-[#8FB4FF]" /> {nf.format(p.comments_count ?? 0)}</p>
                    <p className="flex items-center gap-1.5 font-display text-xs font-bold" style={{ color: AMARELO }}><TrendingUp size={12} className="shrink-0" /> {nf.format((p.like_count ?? 0) + (p.comments_count ?? 0))}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CaixaGrafico>

        {/* Engajamento por publicação ao longo do tempo */}
        <CaixaGrafico titulo="Engajamento por publicação" sub="Últimas 12 publicações, em ordem de postagem">
          {serieEngajamento.length === 0 ? (
            carregando ? <Esqueleto linhas={1} altura={220} /> : <p className="text-center text-sm text-muted-foreground">Sem dados de engajamento.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serieEngajamento} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E29" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#8B8A9B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8B8A9B' }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="engajamento" name="Curtidas + comentários" radius={[4, 4, 0, 0]}>
                  {serieEngajamento.map((d, i) => (
                    <Cell key={i} fill={d.tipo === 'VIDEO' || d.tipo === 'REELS' ? AZUL : AMARELO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: AZUL }} /> Reels ·{' '}
            <span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: AMARELO }} /> Feed
          </p>
        </CaixaGrafico>


        {/* Últimos comentários — o RPC já descarta os que são só emoji */}
        <CaixaGrafico titulo="Últimos comentários" sub="Só os que dizem algo — emojis soltos ficam de fora"
          acao={<Button asChild variant="outline" size="sm"><Link to="/interno/comentarios">Ver todos <ExternalLink size={12} className="ml-1" /></Link></Button>}>
          <ListaInteracoes itens={ultimosComentarios} vazio="Nenhum comentário captado ainda." carregando={carregando} />
        </CaixaGrafico>

        {/* Últimos directs */}
        <CaixaGrafico titulo="Últimos directs" sub="Mensagens recebidas no Instagram"
          acao={<Button asChild variant="outline" size="sm"><Link to="/interno/whatsapp/chat">Abrir Chat <ExternalLink size={12} className="ml-1" /></Link></Button>}>
          <ListaInteracoes itens={ultimosDirects} vazio="Nenhum direct recebido ainda." carregando={carregando} />
        </CaixaGrafico>

        {/* Cliques por evento */}
        <CaixaGrafico titulo="Para onde o público clica" sub={`Cliques no link por evento · últimos ${dias} dias`}>
          {porEvento.length === 0 ? (
            carregando ? <Esqueleto linhas={6} altura={22} /> : <p className="text-center text-sm text-muted-foreground">Nenhum clique no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, porEvento.length * 34)}>
              <BarChart data={porEvento} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11, fill: '#8B8A9B' }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="cliques" name="Cliques" fill={AMARELO} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CaixaGrafico>

        {/* Automações */}
        <CaixaGrafico
          titulo="Automações do Instagram"
          sub="Respostas automáticas a comentários e directs"
          acao={<Button asChild variant="outline" size="sm"><Link to="/interno/automacoes">Abrir <ExternalLink size={12} className="ml-1" /></Link></Button>}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Ativas', nf.format(automacoes.ativas), AMARELO],
              ['Disparos', nf.format(automacoes.disparos), '#F2F1F7'],
              ['DMs enviadas', nf.format(automacoes.dms), VERDE],
              ['Cliques', nf.format(automacoes.cliques), AZUL],
            ].map(([l, v, c]) => (
              <div key={l} className="rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
                <p className="mt-1 font-display text-lg font-bold" style={{ color: c }}>{v}</p>
              </div>
            ))}
          </div>
          {automacoes.ativas === 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Zap size={12} className="text-[#FFE14D]" />
              Nenhuma automação ativa — um modelo pronto leva menos de um minuto para publicar.
            </p>
          )}
        </CaixaGrafico>
      </div>

      <p className="pb-2 text-[11px] text-muted-foreground">
        Alcance, impressões e visitas ao perfil não aparecem aqui porque a Meta exige acesso avançado a
        <span className="font-mono"> read_insights</span> para liberar esses números — em vez de mostrar zero, deixamos de fora.
      </p>
    </div>
  );
}
