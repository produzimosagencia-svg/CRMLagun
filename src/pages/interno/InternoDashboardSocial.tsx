import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Instagram, MessageCircle, TrendingUp, Zap, ExternalLink } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { BarraIndicadores, CORES } from '@/components/interno/BarraIndicadores';
import { noAppDesktop } from '@/components/interno/sessoes';
import { useDashboardSocial, nf, pct, haQuanto, type Interacao } from '@/components/interno/useDashboardSocial';

/* ──────────────────────────────────────────────────────────────────────────
 * Dashboard de redes sociais — tela do SITE.
 *
 * Os dados (e a explicação do que dá para medir de verdade) estão em
 * useDashboardSocial. Dentro do app de computador a mesma rota mostra a
 * tela desenhada para o app (app-desktop/paginas/DashboardMarketing).
 * ────────────────────────────────────────────────────────────────────────── */

const DashboardMarketingApp = lazy(() => import('@/app-desktop/paginas/DashboardMarketing'));

const AMARELO = '#FFE14D';
const VERDE = '#34D399';
const AZUL = '#60A5FA';
const ROSA = '#F472B6';

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
  const quando = haQuanto;
  return (
    <div className="space-y-1.5">
      {itens.map((it, i) => {
        const nome = it.arroba || it.autor;
        const hue = [...(nome || String(i))].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
        return (
          <div key={`${it.quando}-${i}`} className="flex items-start gap-2.5 rounded-lg border border-border/60 px-2.5 py-2">
            <span className="relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-bold text-white"
              style={{ background: `radial-gradient(circle at 30% 30%, oklch(.70 .15 ${hue}), oklch(.42 .17 ${hue}) 70%)` }}>
              {(nome || '?').replace(/^@/, '').slice(0, 2).toUpperCase()}
              {/* A foto do Instagram expira; se não carregar, ficam as iniciais por baixo. */}
              {it.avatar && (
                <img src={it.avatar} alt="" referrerPolicy="no-referrer" loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold">
                  {it.arroba ? `@${String(it.arroba).replace(/^@/, '')}` : it.autor || 'Perfil do Instagram'}
                  {it.arroba && it.autor && it.autor !== it.arroba && <span className="ml-1 font-normal text-muted-foreground">{it.autor}</span>}
                </span>
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
  if (noAppDesktop()) {
    return (
      <Suspense fallback={<div className="flex h-[60vh] items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#FFE14D] border-t-transparent" /></div>}>
        <DashboardMarketingApp />
      </Suspense>
    );
  }
  return <DashboardSocialSite />;
}

function DashboardSocialSite() {
  const {
    dias, setDias, carregando, erroIg, perfil, serie, porEvento, totais, automacoes,
    ultimosComentarios, ultimosDirects, engajamento, topPosts, serieEngajamento,
  } = useDashboardSocial();

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
          { label: 'Engajamento', valor: engajamento.taxa ? pct(engajamento.taxa) : '—', sub: engajamento.posts ? `média de ${engajamento.posts} ${engajamento.posts === 1 ? 'post' : 'posts'}` : undefined, cor: CORES.verde, barra: Math.min(100, engajamento.taxa * 20), soWeb: true },
          { label: 'DMs recebidas', valor: nf.format(totais.dms), sub: `últimos ${dias} dias`, cor: CORES.rosa, barra: 62, soWeb: true },
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
